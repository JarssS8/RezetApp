-- Diseño §9 — los tres avisos que faltaban (`expiring`, `cook_turn`,
-- `log_reminder`) necesitan saber si ya avisaron hoy, para que el cron de
-- `send-member-notifications` (cada hora) no mande el mismo aviso doce
-- veces. `member_notice_log` es ese registro: como mucho una fila por
-- persona, tipo de aviso y día.

create table public.member_notice_log (
  member_id uuid not null references public.member(id) on delete cascade,
  kind      text not null check (kind in ('expiring','cook_turn','log_reminder')),
  on_date   date not null,
  sent_at   timestamptz not null default now(),
  primary key (member_id, kind, on_date)
);

-- RLS activada y SIN NINGUNA política, más el revoke de abajo: esta tabla
-- solo la toca la Edge Function con la service role key (que se salta RLS
-- por completo). Ningún cliente autenticado tiene nada que hacer aquí —no
-- es un dato personal que alguien deba poder leer o exportar, es un cerrojo
-- interno del cron— así que esto no es un olvido de política, es la
-- decisión: cero acceso de cliente, a propósito. Mismo patrón que
-- `app_secret` (20260905150404).
alter table public.member_notice_log enable row level security;
revoke all on public.member_notice_log from anon, authenticated;

-- Cron: cada hora, en el minuto 5 (no en el 0, para no competir con el de
-- send-timer-notifications si algún día ambos tardan). Copia literal de la
-- forma de 20260918100400 (mismo net.http_post, mismo project_url, misma
-- publishable_key, misma cabecera x-rezet-cron). Reutiliza a propósito el
-- secreto `timer_cron_secret` ya existente — es "el secreto del cron", ya
-- está configurado en el panel, y una segunda variable de entorno sería una
-- cosa más que se puede olvidar de poner.
select cron.schedule(
  'send-member-notifications-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-member-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-rezet-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
