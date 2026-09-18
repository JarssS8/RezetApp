-- Diseño §3.6: el cron se identifica con un secreto propio, no solo con la
-- publishable key (que es pública y viaja en el bundle del cliente).
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'timer_cron_secret');

-- Sin `cron.unschedule`: `cron.schedule(nombre, …)` ya reemplaza el job con ese
-- nombre (así se creó en 20260905151005), y unschedule lanza excepción si el
-- nombre no existe, lo que abortaría la migración entera.
select cron.schedule(
  'send-timer-notifications-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-timer-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-rezet-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Límite de filas por perfil: un usuario no puede inflar el trabajo del cron.
-- AFTER INSERT, no BEFORE: `insert … on conflict do update` dispara los BEFORE
-- INSERT también en las filas que acaban actualizando, y tanto
-- useCookTimerSync.ts:26 como push.ts:71 hacen upsert. Con BEFORE, al llegar al
-- tope, reenviar un temporizador o un endpoint YA existente fallaría para
-- siempre aunque no añada ninguna fila.
create or replace function private.limit_rows_per_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  execute format('select count(*) from public.%I where profile_id = $1', tg_argv[0])
    into v_count using new.profile_id;
  if v_count > tg_argv[1]::int then   -- en AFTER la fila nueva ya está contada
    raise exception 'REZET_TOO_MANY_ROWS';
  end if;
  return null;  -- ignorado en AFTER
end;
$$;

revoke all on function private.limit_rows_per_profile() from public, anon, authenticated;

drop trigger if exists push_subscription_limit_trg on public.push_subscription;
create trigger push_subscription_limit_trg
after insert on public.push_subscription
for each row execute function private.limit_rows_per_profile('push_subscription', '10');

drop trigger if exists cook_timer_limit_trg on public.cook_timer;
create trigger cook_timer_limit_trg
after insert on public.cook_timer
for each row execute function private.limit_rows_per_profile('cook_timer', '50');
