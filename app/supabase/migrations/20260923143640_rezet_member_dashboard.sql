-- Diseño §7 — el dashboard de cada persona.
--
-- Va en tabla y no en `prefs` a propósito: `prefs` es por dispositivo y lo
-- que se pidió es personalización por miembro. Un dashboard que no te sigue
-- al segundo dispositivo no es lo que se pidió.
--
-- `layout` es JSONB y no una tabla-por-widget porque se lee y se escribe
-- siempre entero: no hay ninguna consulta que pregunte por un widget suelto.
-- El esquema de dentro lo valida `domain/dashboard.ts`, que nunca lanza; la
-- base solo exige que sea JSON.

create table public.member_dashboard (
  member_id  uuid primary key references public.member(id) on delete cascade,
  layout     jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.member_dashboard enable row level security;

-- Nivel "propio" (§3.2): lo tuyo, y lo de quien tutelas. `can_act_for` ya
-- comprueba las tres cosas a la vez — vivo, mismo hogar, y tuyo o tutelado.
create policy member_dashboard_rw on public.member_dashboard for all
  to authenticated
  using ((select private.can_act_for(member_dashboard.member_id)))
  with check ((select private.can_act_for(member_dashboard.member_id)));

revoke all on public.member_dashboard from anon, authenticated;
grant select, insert, update, delete on public.member_dashboard to authenticated;

comment on column public.member_dashboard.layout is
  'Lista de widgets con orden, tamaño y encendido. La valida domain/dashboard.ts; aquí solo se exige JSON.';
