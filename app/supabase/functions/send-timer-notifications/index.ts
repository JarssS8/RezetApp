import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cronAuthStatus } from "./logic.ts";

const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];
const MAX_SENDS_PER_RUN = 200;
const SEND_TIMEOUT_MS = 10_000;

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

/**
 * M8b — disparada por pg_cron cada minuto (ver migración
 * rezet_web_push_cron). Busca cook_timer vencidos y sin avisar, manda un
 * push por cada push_subscription del perfil, y marca notified_at.
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY (inyectada automáticamente por Supabase en
 * toda Edge Function) para saltarse RLS — esta función necesita ver los
 * temporizadores y suscripciones de TODOS los hogares, no solo uno.
 */
Deno.serve(async (req) => {
  // Diseño §3.6: el cron manda un secreto propio (`x-rezet-cron`), no solo la
  // publishable key (pública, viaja en el bundle del cliente). Falla cerrado:
  // sin `TIMER_CRON_SECRET` configurado se rechaza todo (auditoría run-3).
  const denied = cronAuthStatus(Deno.env.get("TIMER_CRON_SECRET"), req.headers.get("x-rezet-cron"));
  if (denied === 503) {
    console.warn("send-timer-notifications: TIMER_CRON_SECRET sin configurar, se rechaza");
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
    console.error("send-timer-notifications: failed to read app_secret");
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

  const { data: due, error: dueError } = await supabase
    .from("cook_timer")
    .select("id, profile_id, step_index")
    .lte("ends_at", new Date().toISOString())
    .is("notified_at", null);
  if (dueError) {
    console.error("send-timer-notifications: failed to read cook_timer");
    return new Response(JSON.stringify({ error: "failed to read cook_timer" }), { status: 500 });
  }

  // `cook_timer.profile_id` y `push_subscription.profile_id` cuelgan de
  // `profile`; las preferencias cuelgan de `member`, así que hace falta
  // resolver el member correspondiente por `auth_user_id`. Se hace en UNA
  // consulta para todos los `profile_id` de esta pasada (no una por
  // temporizador dentro del bucle) porque la lista de vencidos no tiene
  // `limit`: si el cron ha estado parado y se acumulan temporizadores de
  // varios hogares, ese coste no está acotado por MAX_SENDS_PER_RUN.
  //
  // Las horas de silencio NO aplican aquí a propósito (diseño, ver
  // member_notify_pref): un temporizador que se traga porque son las 23:10
  // es comida quemada, así que solo se mira el interruptor propio `timers`.
  //
  // Sin fila de member (p. ej. member borrado) o sin fila de preferencias
  // (nadie ha tocado el ajuste todavía), se manda igual que siempre: una
  // preferencia que no existe no puede silenciar a nadie.
  const profileIds = [...new Set((due ?? []).map((t) => t.profile_id))];
  const timersOffProfiles = new Set<string>();
  if (profileIds.length > 0) {
    const { data: members } = await supabase
      .from("member")
      .select("auth_user_id, member_notify_pref(timers)")
      .in("auth_user_id", profileIds)
      .is("deleted_at", null);
    for (const m of members ?? []) {
      // El embed de PostgREST siempre lo tipa como array aunque la relación
      // sea a-uno (member_notify_pref.member_id es la PK de esa tabla).
      const pref = Array.isArray(m.member_notify_pref) ? m.member_notify_pref[0] : m.member_notify_pref;
      if (pref && pref.timers === false) timersOffProfiles.add(m.auth_user_id);
    }
  }

  let sent = 0;
  for (const timer of due ?? []) {
    // El tope se comprueba antes de empezar un temporizador, nunca a medias: la
    // marca de `notified_at` de más abajo daría por avisado un temporizador que
    // solo llegó a la mitad de sus dispositivos, y el cron no vuelve a él.
    if (sent >= MAX_SENDS_PER_RUN) break;

    if (timersOffProfiles.has(timer.profile_id)) {
      // Se marca avisado igual: si no, el cron lo reintentaría para siempre.
      await supabase.from("cook_timer").update({ notified_at: new Date().toISOString() }).eq("id", timer.id);
      continue;
    }

    const { data: subs } = await supabase
      .from("push_subscription")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", timer.profile_id);

    const payload = JSON.stringify({
      title: "Rezet",
      body: `Paso ${timer.step_index + 1}: el temporizador ha terminado`,
    });

    for (const sub of subs ?? []) {
      if (!isAllowedEndpoint(sub.endpoint)) {
        // Solo puede ser un resto anterior al CHECK de la base de datos.
        console.warn("send-timer-notifications: endpoint no permitido, se descarta");
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
          // Suscripción caducada/revocada por el navegador: se borra para no
          // reintentar en vano en cada pasada del cron.
          await supabase.from("push_subscription").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    await supabase.from("cook_timer").update({ notified_at: new Date().toISOString() }).eq("id", timer.id);
  }

  return new Response(JSON.stringify({ checked: due?.length ?? 0, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
