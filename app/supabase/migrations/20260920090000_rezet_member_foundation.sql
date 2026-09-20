-- Diseño §3.1, §3.2, §5.1-5.2 — "member" es la identidad de producto del
-- hogar. `profile` sigue mandando en autenticación, hogar y rol de admin;
-- esta tabla existe para que pueda haber miembros SIN cuenta (niños,
-- invitados) y para que todo lo personal (kcal, gustos, dietas) apunte a un
-- id que no dependa de auth.users.

create table public.member (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  auth_user_id  uuid references public.profile(id) on delete set null,
  -- La tutela es EXPLÍCITA, no "auth_user_id is null". Todas las salidas del
  -- hogar borran la fila de profile, así que inferirla de la ausencia de
  -- cuenta convertiría en tutelado a quien se va, y sus datos personales
  -- quedarían a la vista de quien se queda.
  is_ward       boolean not null default false,
  display_name  text not null,
  avatar_path   text,
  color         text not null default 'green',
  sort_order    int  not null default 0,
  -- El check vive aquí y no solo en el cliente: un PATCH directo a PostgREST
  -- no pasa por la interfaz.
  kcal_target   int  not null default 2100 check (kcal_target between 1000 and 5000),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index member_household_idx on public.member (household_id) where deleted_at is null;
-- Índice parcial en vez de `unique` en la columna: un UNIQUE de Postgres ya
-- admite varios NULL, así que declarar ambos serían dos índices para la misma
-- garantía.
create unique index member_auth_uq on public.member (auth_user_id) where auth_user_id is not null;

-- ── Helpers ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER igual que private.current_household(): si leyera `member`
-- bajo RLS, cualquier política de `member` que lo usara provocaría recursión
-- infinita (42P17).

create or replace function private.current_member()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.member
   where auth_user_id = (select auth.uid()) and deleted_at is null
   limit 1
$$;

revoke all on function private.current_member() from public, anon;
grant execute on function private.current_member() to authenticated;

-- El predicado único de autorización personal. Lo usarán TODAS las tablas
-- personales de las fases siguientes (member_body, intake_*, dashboard...).
-- Las tres condiciones son necesarias:
--   household_id → sin ella, `is_ward` es una condición global y cualquiera
--                  escribiría en el tutelado de otro hogar sabiendo su UUID.
--   is_ward      → ver el comentario de la columna.
--   deleted_at   → un miembro borrado no es tutelable.
create or replace function private.can_act_for(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member m
     where m.id = p_member_id
       and m.deleted_at is null
       and m.household_id = (select private.current_household())
       and (m.auth_user_id = (select auth.uid()) or m.is_ward)
  )
$$;

revoke all on function private.can_act_for(uuid) from public, anon;
grant execute on function private.can_act_for(uuid) to authenticated;

-- ── Backfill ─────────────────────────────────────────────────────────────
-- Una fila por perfil existente. `color` hereda el acento de la cuenta, que
-- es lo más parecido a una elección que ya hizo esa persona.

insert into public.member (household_id, auth_user_id, display_name, color, kcal_target)
select p.household_id, p.id, p.display_name, coalesce(p.accent, 'green'), h.kcal_target
  from public.profile p
  join public.household h on h.id = p.household_id;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.member enable row level security;

-- Se leen TAMBIÉN los borrados: hacen falta para resolver la atribución del
-- historial ("lo registró X") cuando X ya no está. La interfaz los marca
-- como inactivos.
create policy member_select on public.member for select
  to authenticated
  using (household_id = (select private.current_household()));

create policy member_update_self on public.member for update
  to authenticated
  using (auth_user_id = (select auth.uid()) and deleted_at is null)
  with check (auth_user_id = (select auth.uid()) and deleted_at is null);

-- ── Grants ───────────────────────────────────────────────────────────────
-- Primero la tabla, luego las columnas: un `revoke update (col)` no hace
-- nada mientras siga vivo el grant de tabla (20260917070714 → 20260917070845).

revoke all on public.member from anon, authenticated;
grant select on public.member to authenticated;
grant update (display_name, avatar_path, color, sort_order, kcal_target)
  on public.member to authenticated;

-- INSERT y DELETE: ningún rol. Crear identidad dentro de un hogar solo pasa
-- por RPC, igual que se cerró `profile` en 20260917220000.
