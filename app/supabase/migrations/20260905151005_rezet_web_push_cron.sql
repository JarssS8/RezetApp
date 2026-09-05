-- M8b — dispara send-timer-notifications cada minuto. Vault guarda la
-- publishable key que autentica la llamada (capa de invocación, no de
-- usuario); la función usa su propia SUPABASE_SERVICE_ROLE_KEY por dentro.
-- La publishable key no es secreta (ya viaja en el bundle del cliente), así
-- que no pasa nada por tenerla en una migración versionada.
select vault.create_secret('https://raepigwmunhguzkmzukd.supabase.co', 'project_url');
select vault.create_secret('sb_publishable_Byl3kEJaQ2326-qfT_hvHA_9PtIKhGb', 'publishable_key');

select cron.schedule(
  'send-timer-notifications-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-timer-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
