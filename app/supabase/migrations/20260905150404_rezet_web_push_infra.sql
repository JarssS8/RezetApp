-- M8b — infraestructura de Web Push para los temporizadores de cocina.
--
-- Los temporizadores viven en el cliente (endsAt absoluto, ver CLAUDE.md);
-- para poder avisar con la pestaña cerrada, el cliente sincroniza aquí SOLO
-- los que tienen minutero, y un cron server-side los vigila.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Secretos de servidor. RLS sin políticas = nadie con anon/authenticated los
-- ve nunca; service_role (el que usa la Edge Function) siempre salta RLS.
create table app_secret (
  key   text primary key,
  value text not null
);
alter table app_secret enable row level security;
revoke all on app_secret from anon, authenticated;

create table cook_timer (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  profile_id    uuid not null references profile(id) on delete cascade,
  recipe_id     uuid not null references recipe(id) on delete cascade,
  step_index    int not null,
  ends_at       timestamptz not null,
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (profile_id, recipe_id, step_index)
);
create index cook_timer_household_id_idx on cook_timer (household_id);
create index cook_timer_pending_idx on cook_timer (ends_at) where notified_at is null;

alter table cook_timer enable row level security;

create policy cook_timer_rw on cook_timer
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and household_id = (select private.current_household()));

grant select, insert, update, delete on cook_timer to authenticated;
grant usage on schema public to authenticated;

-- NOTA: las claves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)
-- se insertan aparte con execute_sql, no en una migración — no pertenecen al
-- control de versiones. Si reconstruyes este esquema desde cero, genera un
-- par de claves nuevo e insértalo tú mismo en `app_secret`.
