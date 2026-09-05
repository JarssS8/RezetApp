import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * M8b — disparada por pg_cron cada minuto (ver migración
 * rezet_web_push_cron). Busca cook_timer vencidos y sin avisar, manda un
 * push por cada push_subscription del perfil, y marca notified_at.
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY (inyectada automáticamente por Supabase en
 * toda Edge Function) para saltarse RLS — esta función necesita ver los
 * temporizadores y suscripciones de TODOS los hogares, no solo uno.
 */
Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: secretRows, error: secretError } = await supabase
    .from("app_secret")
    .select("key, value");
  if (secretError) {
    return new Response(JSON.stringify({ error: secretError.message }), { status: 500 });
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
    return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
  }

  let sent = 0;
  for (const timer of due ?? []) {
    const { data: subs } = await supabase
      .from("push_subscription")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", timer.profile_id);

    const payload = JSON.stringify({
      title: "Rezet",
      body: `Paso ${timer.step_index + 1}: el temporizador ha terminado`,
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
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
