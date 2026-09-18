-- Diseño §3.4: las fotos de recetas borradas seguían servidas por URL. El
-- borrado en el cliente (Fase A) cubre lo que se borre a partir de ahora;
-- esto barre lo viejo y lo que dejen los borrados de hogar y de cuenta, que
-- desde SQL no pueden tocar Storage.
select cron.schedule(
  'cleanup-orphan-photos-daily',
  '17 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/cleanup-orphan-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-rezet-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
