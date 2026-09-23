import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cronAuthStatus } from "../send-timer-notifications/logic.ts";
import { HOUSEHOLD_TIME_ZONE, localMinutes } from "../send-timer-notifications/quiet.ts";
import { dueNotices, type NotifyPrefRow } from "./due.ts";

const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];
const MAX_SENDS_PER_RUN = 200;
const SEND_TIMEOUT_MS = 10_000;
const EXPIRING_WINDOW_DAYS = 3;

function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      ALLOWED_PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

/** Suma días de calendario a una fecha `'YYYY-MM-DD'`, sin horas ni zona. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type NoticeKind = "expiring" | "cook_turn" | "log_reminder";

// Los textos van en castellano y sin i18n de servidor, igual que
// `send-timer-notifications` ("Paso N: el temporizador ha terminado") — el
// repo no tiene i18n en el servidor y este no es el momento de añadirlo.
// Deuda conocida, anotada también en el informe de esta tarea.
function bodyFor(kind: NoticeKind, ctx: { expiringCount: number; expiringFirst: string }): string {
  switch (kind) {
    case "expiring":
      return ctx.expiringCount <= 1
        ? `${ctx.expiringFirst} está a punto de caducar.`
        : `${ctx.expiringCount} cosas de la despensa están a punto de caducar, empezando por ${ctx.expiringFirst}.`;
    case "cook_turn":
      return "Hoy te toca cocinar.";
    case "log_reminder":
      return "Todavía no has registrado lo que has comido hoy.";
  }
}

/**
 * M4/M5/M7 (§9) — disparada por pg_cron cada hora en punto y cinco (ver
 * migración `rezet_member_notice_log`). Manda como mucho un aviso de cada
 * tipo (`expiring`, `cook_turn`, `log_reminder`) por miembro y día,
 * respetando las horas de silencio de `member_notify_pref` — a diferencia
 * de `send-timer-notifications`, que las ignora a propósito.
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY para saltarse RLS: esta función necesita ver
 * miembros, despensa y plan de TODOS los hogares, no solo uno.
 */
Deno.serve(async (req) => {
  // Mismo secreto que `send-timer-notifications` ("el secreto del cron"), a
  // propósito: ya está configurado en el panel y una segunda variable de
  // entorno sería una cosa más que se puede olvidar de poner.
  const denied = cronAuthStatus(Deno.env.get("TIMER_CRON_SECRET"), req.headers.get("x-rezet-cron"));
  if (denied === 503) {
    console.warn("send-member-notifications: TIMER_CRON_SECRET sin configurar, se rechaza");
    return new Response("not configured", { status: 503 });
  }
  if (denied === 401) return new Response("unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: secretRows, error: secretError } = await supabase
    .from("app_secret")
    .select("key, value");
  if (secretError) {
    // Sin volcar secretError.message: puede llevar detalle interno de Postgres.
    console.error("send-member-notifications: failed to read app_secret");
    return new Response(JSON.stringify({ error: "failed to read secrets" }), { status: 500 });
  }
  const secrets = Object.fromEntries((secretRows ?? []).map((s) => [s.key, s.value]));
  if (!secrets.VAPID_PUBLIC_KEY || !secrets.VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "missing VAPID secrets" }), { status: 500 });
  }
  webpush.setVapidDetails(
    secrets.VAPID_SUBJECT ?? "mailto:noreply@example.com",
    secrets.VAPID_PUBLIC_KEY,
    secrets.VAPID_PRIVATE_KEY,
  );

  const now = new Date();
  const hour = Math.floor(localMinutes(now, HOUSEHOLD_TIME_ZONE) / 60);
  // `en-CA` da directamente 'YYYY-MM-DD' — la fecha del día en Madrid, no en
  // UTC (una Edge Function corre en UTC; ver `quiet.ts`).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: HOUSEHOLD_TIME_ZONE }).format(now);
  const expiringUntil = addDays(today, EXPIRING_WINDOW_DAYS);

  // Miembros vivos CON cuenta: un tutelado sin cuenta no tiene dónde recibir
  // un aviso push, así que se salta directamente aquí.
  const { data: members, error: membersError } = await supabase
    .from("member")
    .select(
      "id, household_id, auth_user_id, member_notify_pref(expiring, cook_turn, log_reminder, log_reminder_at, quiet_from, quiet_to)",
    )
    .is("deleted_at", null)
    .not("auth_user_id", "is", null);
  if (membersError) {
    console.error("send-member-notifications: failed to read member");
    return new Response(JSON.stringify({ error: "failed to read member" }), { status: 500 });
  }
  if (!members || members.length === 0) {
    return new Response(JSON.stringify({ hour, checked: 0, sent: 0, skipped: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberIds = members.map((m) => m.id);
  const householdIds = [...new Set(members.map((m) => m.household_id))];

  const [{ data: householdRows, error: householdError }, { data: expiringRows, error: expiringError }, {
    data: cookRows,
    error: cookError,
  }, { data: cookedRows, error: cookedError }, { data: intakeRows, error: intakeError }, {
    data: sentRows,
    error: sentError,
  }] = await Promise.all([
    supabase.from("household").select("id, turns_enabled").in("id", householdIds),
    supabase
      .from("pantry_item")
      .select("household_id, expires_on, ingredient:ingredient_id(name_es)")
      .in("household_id", householdIds)
      .gte("expires_on", today)
      .lte("expires_on", expiringUntil)
      .order("expires_on", { ascending: true }),
    supabase
      .from("plan_entry")
      .select("cook_member_id")
      .in("household_id", householdIds)
      .eq("on_date", today)
      .not("cook_member_id", "is", null),
    supabase
      .from("plan_entry")
      .select("household_id")
      .in("household_id", householdIds)
      .eq("on_date", today)
      .not("cooked_at", "is", null),
    supabase.from("intake_extra").select("member_id").in("member_id", memberIds).eq("date", today),
    supabase.from("member_notice_log").select("member_id, kind").eq("on_date", today).in("member_id", memberIds),
  ]);
  if (householdError || expiringError || cookError || cookedError || intakeError || sentError) {
    console.error("send-member-notifications: failed to read plan/pantry/log state");
    return new Response(JSON.stringify({ error: "failed to read state" }), { status: 500 });
  }

  const turnsEnabledByHousehold = new Map((householdRows ?? []).map((h) => [h.id, h.turns_enabled === true]));

  const expiringByHousehold = new Map<string, { count: number; first: string }>();
  for (const row of expiringRows ?? []) {
    const existing = expiringByHousehold.get(row.household_id);
    const ingredient = Array.isArray(row.ingredient) ? row.ingredient[0] : row.ingredient;
    const name = ingredient?.name_es ?? "un ingrediente";
    if (existing) existing.count += 1;
    else expiringByHousehold.set(row.household_id, { count: 1, first: name });
  }

  const cookMemberIdsToday = new Set((cookRows ?? []).map((r) => r.cook_member_id as string));
  const householdsCookedToday = new Set((cookedRows ?? []).map((r) => r.household_id));
  const membersLoggedIntakeToday = new Set((intakeRows ?? []).map((r) => r.member_id));
  const alreadySent = new Set((sentRows ?? []).map((r) => `${r.member_id}|${r.kind}`));

  let checked = 0;
  let sent = 0;
  let skipped = 0;

  outer: for (const member of members) {
    checked++;
    const prefRow = Array.isArray(member.member_notify_pref) ? member.member_notify_pref[0] : member.member_notify_pref;
    const pref: NotifyPrefRow | null = prefRow ?? null;
    const expiringInfo = expiringByHousehold.get(member.household_id);

    const due = dueNotices({
      now,
      pref,
      turnsEnabled: turnsEnabledByHousehold.get(member.household_id) === true,
      hasExpiringSoon: expiringInfo != null,
      isCookToday: cookMemberIdsToday.has(member.id),
      hasLoggedToday:
        membersLoggedIntakeToday.has(member.id) || householdsCookedToday.has(member.household_id),
    });

    const wanted: NoticeKind[] = [];
    if (due.expiring) wanted.push("expiring");
    if (due.cookTurn) wanted.push("cook_turn");
    if (due.logReminder) wanted.push("log_reminder");
    if (wanted.length === 0) continue;

    const { data: subs } = await supabase
      .from("push_subscription")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", member.auth_user_id);

    for (const kind of wanted) {
      if (alreadySent.has(`${member.id}|${kind}`)) {
        skipped++;
        continue;
      }

      // El tope se comprueba antes de empezar un aviso, nunca a medias: si
      // no, marcar `member_notice_log` daría por avisado un aviso que solo
      // llegó a la mitad de los dispositivos de esa persona.
      if (sent >= MAX_SENDS_PER_RUN) break outer;

      const body = bodyFor(kind, {
        expiringCount: expiringInfo?.count ?? 0,
        expiringFirst: expiringInfo?.first ?? "",
      });
      const payload = JSON.stringify({ title: "Rezet", body });

      for (const sub of subs ?? []) {
        if (!isAllowedEndpoint(sub.endpoint)) {
          console.warn("send-member-notifications: endpoint no permitido, se descarta");
          continue;
        }
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { timeout: SEND_TIMEOUT_MS },
          );
          sent++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscription").delete().eq("endpoint", sub.endpoint);
          }
        }
      }

      // `ignoreDuplicates`: dos pasadas del cron solapadas no se pelean por
      // la misma fila (la PK es (member_id, kind, on_date)).
      await supabase
        .from("member_notice_log")
        .upsert({ member_id: member.id, kind, on_date: today }, { onConflict: "member_id,kind,on_date", ignoreDuplicates: true });
    }
  }

  return new Response(JSON.stringify({ hour, checked, sent, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});
