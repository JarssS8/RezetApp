-- Diseño §9 — qué te avisa la app y cuándo, por persona.
--
-- Nivel de privacidad "propio": lo que quieres que te moleste es tuyo, así
-- que reusa `can_act_for` como el resto de tablas personales.

create table public.member_notify_pref (
  member_id       uuid primary key references public.member(id) on delete cascade,
  timers          boolean not null default true,
  expiring        boolean not null default true,
  cook_turn       boolean not null default true,
  -- Apagado por defecto a propósito: una app que da la lata sin que se lo
  -- pidas se desinstala.
  log_reminder    boolean not null default false,
  log_reminder_at time not null default '21:00',
  quiet_from      time,
  quiet_to        time,
  updated_at      timestamptz not null default now()
);

alter table public.member_notify_pref enable row level security;

create policy member_notify_pref_rw on public.member_notify_pref for all
  to authenticated
  using ((select private.can_act_for(member_notify_pref.member_id)))
  with check ((select private.can_act_for(member_notify_pref.member_id)));

revoke all on public.member_notify_pref from anon, authenticated;
grant select, insert, update, delete on public.member_notify_pref to authenticated;

-- Los temporizadores de cocina NO entran en las horas de silencio: uno que
-- se traga porque son las 23:10 es comida quemada, no una notificación
-- molesta. `quiet_from`/`quiet_to` aplican a `expiring`, `cook_turn` y
-- `log_reminder`; `timers` solo se apaga con su propio interruptor.
comment on column public.member_notify_pref.timers is
  'Temporizadores de cocina. Exentos de las horas de silencio por diseño.';
