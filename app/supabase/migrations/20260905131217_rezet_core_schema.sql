-- Rezet — M1: esquema base, RLS, hogares auto-creados con invitación
-- Basado en BUILD_FROM_ZERO.md §3, corrigiendo la línea inválida de recipe_step,
-- + household_invite / push_subscription de PLAN.md §4.

create schema if not exists private;

create type unit          as enum ('g','ml','ud');
create type food_group    as enum ('fresco','seco','conserva');
create type pantry_loc    as enum ('cupboard','fridge','freezer');
create type meal_slot     as enum ('breakfast','lunch','dinner','snack');
create type difficulty    as enum ('easy','medium','hard');

-- ── Tablas ──────────────────────────────────────────────────────────────

create table household (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kcal_target  int  not null default 2100,
  created_at   timestamptz not null default now()
);

create table profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references household(id) on delete cascade,
  display_name  text not null,
  locale        text not null default 'es',
  theme         text not null default 'system',
  accent        text not null default 'green',
  units         text not null default 'metric',
  onboarded_at  timestamptz
);
create index profile_household_id_idx on profile (household_id);

create table ingredient (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references household(id) on delete cascade,
  name_es       text not null,
  name_en       text not null,
  food_group    food_group not null default 'seco',
  default_unit  unit not null default 'g',
  is_sensitive  boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index ingredient_name_uq on ingredient (household_id, lower(name_es));

create table recipe (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references household(id) on delete cascade,
  name              text not null,
  description       text not null default '',
  base_servings     int  not null default 2 check (base_servings between 1 and 24),
  minutes           int  not null default 20,
  difficulty        difficulty not null default 'easy',
  kcal_per_serving  int  not null default 450,
  cooked_count      int  not null default 0,
  photo_path        text,
  created_by        uuid references profile(id),
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);
create index recipe_household_id_idx on recipe (household_id) where archived_at is null;

create table recipe_tag (
  recipe_id uuid not null references recipe(id) on delete cascade,
  tag       text not null,
  primary key (recipe_id, tag)
);

create table recipe_ingredient (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipe(id) on delete cascade,
  ingredient_id uuid not null references ingredient(id),
  quantity      numeric(10,2) not null check (quantity > 0),
  unit          unit not null,
  position      int not null
);
create index recipe_ingredient_recipe_id_idx on recipe_ingredient (recipe_id, position);
create index recipe_ingredient_ingredient_id_idx on recipe_ingredient (ingredient_id);

create table recipe_step (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references recipe(id) on delete cascade,
  position       int not null,
  text           text not null,
  timer_minutes  int
);
create index recipe_step_recipe_id_idx on recipe_step (recipe_id, position);

-- La relación que hace que cada paso muestre SOLO sus ingredientes.
-- Si está vacía para un paso, el cliente cae al emparejado por texto (README §4.9).
create table recipe_step_ingredient (
  step_id              uuid not null references recipe_step(id) on delete cascade,
  recipe_ingredient_id uuid not null references recipe_ingredient(id) on delete cascade,
  primary key (step_id, recipe_ingredient_id)
);

create table pantry_item (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  ingredient_id uuid not null references ingredient(id),
  quantity      numeric(10,2) not null check (quantity >= 0),
  unit          unit not null,
  location      pantry_loc not null default 'cupboard',
  expires_on    date,
  updated_at    timestamptz not null default now()
);
create unique index pantry_item_uq on pantry_item (household_id, ingredient_id, unit, location);
create index pantry_item_ingredient_id_idx on pantry_item (ingredient_id);

create table plan_entry (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references household(id) on delete cascade,
  on_date          date not null,
  slot             meal_slot not null,
  recipe_id        uuid not null references recipe(id) on delete cascade,
  servings         int not null check (servings between 1 and 24),
  cooked_at        timestamptz,
  servings_cooked  int,
  position         int not null default 0,
  created_at       timestamptz not null default now()
);
create index plan_entry_household_id_idx on plan_entry (household_id, on_date);
create index plan_entry_recipe_id_idx on plan_entry (recipe_id);

create table cook_log (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references household(id) on delete cascade,
  recipe_id      uuid not null references recipe(id),
  plan_entry_id  uuid references plan_entry(id) on delete set null,
  servings       int not null,
  shortages      jsonb not null default '[]',
  cooked_at      timestamptz not null default now(),
  cooked_by      uuid references profile(id)
);
create index cook_log_household_id_idx on cook_log (household_id);
create index cook_log_recipe_id_idx on cook_log (recipe_id);

-- Las marcas de la lista de la compra son compartidas: dos personas
-- en el súper a la vez tienen que ver lo mismo.
create table shopping_check (
  household_id uuid not null references household(id) on delete cascade,
  item_key     text not null,
  checked_at   timestamptz not null default now(),
  primary key (household_id, item_key)
);

-- ── Nuevas para hogares auto-creados + invitación (PLAN.md §4) ─────────

create table household_invite (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  code          text not null unique
                  default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10)),
  created_by    uuid references profile(id),
  expires_at    timestamptz not null default now() + interval '7 days',
  used_by       uuid references profile(id),
  used_at       timestamptz
);
create index household_invite_household_id_idx on household_invite (household_id);

create table push_subscription (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profile(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);
create index push_subscription_profile_id_idx on push_subscription (profile_id);

-- ── Trigger: updated_at de despensa refleja el último movimiento real ──

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pantry_item_set_updated_at
before update on pantry_item
for each row execute function private.set_updated_at();

-- ── Multi-tenant: current_household() ──────────────────────────────────
-- SECURITY DEFINER a propósito: lee la fila propia de `profile` sin pasar
-- otra vez por la política de `profile` (que si no, se llamaría a sí misma).

create or replace function private.current_household()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.profile where id = (select auth.uid())
$$;

revoke all on function private.current_household() from public;
grant execute on function private.current_household() to authenticated;

-- ── Trigger: household_id de profile no se cambia por UPDATE directo ───
-- Solo se establece al crear el perfil (create_household / redeem_invite).

create or replace function private.protect_profile_household()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'household_id no se puede modificar directamente';
  end if;
  return new;
end;
$$;

create trigger profile_protect_household_trg
before update on profile
for each row execute function private.protect_profile_household();

-- ── RPC: crear hogar (registro abierto) ────────────────────────────────

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profile where id = (select auth.uid())) then
    raise exception 'ya perteneces a un hogar';
  end if;

  insert into public.household (name) values (p_name) returning id into v_household_id;
  insert into public.profile (id, household_id, display_name)
    values ((select auth.uid()), v_household_id, p_display_name);

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public;
grant execute on function public.create_household(text, text) to authenticated;

-- ── RPC: canjear invitación ─────────────────────────────────────────────
-- SECURITY DEFINER a propósito: quien canjea aún no es miembro del hogar,
-- así que no puede leer household_invite bajo sus propias políticas RLS.

create or replace function public.redeem_invite(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.household_invite%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profile where id = (select auth.uid())) then
    raise exception 'ya perteneces a un hogar';
  end if;

  select * into v_invite
  from public.household_invite
  where code = upper(p_code)
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'código de invitación inválido o caducado';
  end if;

  insert into public.profile (id, household_id, display_name)
    values ((select auth.uid()), v_invite.household_id, p_display_name);

  update public.household_invite
    set used_by = (select auth.uid()), used_at = now()
    where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function public.redeem_invite(text, text) from public;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────

alter table household enable row level security;
alter table profile enable row level security;
alter table ingredient enable row level security;
alter table recipe enable row level security;
alter table recipe_tag enable row level security;
alter table recipe_ingredient enable row level security;
alter table recipe_step enable row level security;
alter table recipe_step_ingredient enable row level security;
alter table pantry_item enable row level security;
alter table plan_entry enable row level security;
alter table cook_log enable row level security;
alter table shopping_check enable row level security;
alter table household_invite enable row level security;
alter table push_subscription enable row level security;

-- household: cualquiera autenticado puede CREAR uno (registro abierto);
-- solo sus miembros lo ven/editan.
create policy household_select on household for select
  to authenticated using (id = (select private.current_household()));
create policy household_insert on household for insert
  to authenticated with check (true);
create policy household_update on household for update
  to authenticated
  using (id = (select private.current_household()))
  with check (id = (select private.current_household()));

-- profile: te ves a ti mismo y a quien comparta tu hogar; solo te editas a ti.
create policy profile_select on profile for select
  to authenticated
  using (id = (select auth.uid()) or household_id = (select private.current_household()));
create policy profile_insert on profile for insert
  to authenticated with check (id = (select auth.uid()));
create policy profile_update on profile for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ingredient: catálogo global (household_id is null) + el propio del hogar.
create policy ingredient_select on ingredient for select
  to authenticated
  using (household_id = (select private.current_household()) or household_id is null);
create policy ingredient_insert on ingredient for insert
  to authenticated with check (household_id = (select private.current_household()));
create policy ingredient_update on ingredient for update
  to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));

create policy recipe_rw on recipe
  for all to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));

create policy recipe_tag_rw on recipe_tag
  for all to authenticated
  using (exists (select 1 from recipe r where r.id = recipe_tag.recipe_id and r.household_id = (select private.current_household())))
  with check (exists (select 1 from recipe r where r.id = recipe_tag.recipe_id and r.household_id = (select private.current_household())));

create policy recipe_ingredient_rw on recipe_ingredient
  for all to authenticated
  using (exists (select 1 from recipe r where r.id = recipe_ingredient.recipe_id and r.household_id = (select private.current_household())))
  with check (exists (select 1 from recipe r where r.id = recipe_ingredient.recipe_id and r.household_id = (select private.current_household())));

create policy recipe_step_rw on recipe_step
  for all to authenticated
  using (exists (select 1 from recipe r where r.id = recipe_step.recipe_id and r.household_id = (select private.current_household())))
  with check (exists (select 1 from recipe r where r.id = recipe_step.recipe_id and r.household_id = (select private.current_household())));

create policy recipe_step_ingredient_rw on recipe_step_ingredient
  for all to authenticated
  using (exists (
    select 1 from recipe_step s
    join recipe r on r.id = s.recipe_id
    where s.id = recipe_step_ingredient.step_id and r.household_id = (select private.current_household())
  ))
  with check (exists (
    select 1 from recipe_step s
    join recipe r on r.id = s.recipe_id
    where s.id = recipe_step_ingredient.step_id and r.household_id = (select private.current_household())
  ));

create policy pantry_item_rw on pantry_item
  for all to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));

create policy plan_entry_rw on plan_entry
  for all to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));

-- cook_log: solo lectura + inserción directa (finish_cook llegará en M4);
-- es un registro histórico, no se edita ni se borra desde el cliente.
create policy cook_log_select on cook_log for select
  to authenticated using (household_id = (select private.current_household()));
create policy cook_log_insert on cook_log for insert
  to authenticated with check (household_id = (select private.current_household()));

create policy shopping_check_rw on shopping_check
  for all to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));

-- household_invite: los miembros crean/ven las invitaciones de su hogar;
-- marcarlas usadas solo lo hace redeem_invite (SECURITY DEFINER, sin política).
create policy household_invite_select on household_invite for select
  to authenticated using (household_id = (select private.current_household()));
create policy household_invite_insert on household_invite for insert
  to authenticated with check (household_id = (select private.current_household()));

create policy push_subscription_rw on push_subscription
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ── Privilegios de la Data API ───────────────────────────────────────
-- Redundante en este proyecto (Supabase concede privilegios por defecto a
-- anon/authenticated en tablas nuevas de `public` vía ALTER DEFAULT
-- PRIVILEGES, pase lo que pase con el switch "Automatically expose new
-- tables" del dashboard, que solo afecta a la UI de Studio). Se deja
-- explícito de todos modos: si esos default privileges cambian alguna vez,
-- esta migración sigue siendo la fuente de verdad de quién debería tener
-- acceso a qué tabla.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  household, profile, ingredient, recipe, recipe_tag, recipe_ingredient,
  recipe_step, recipe_step_ingredient, pantry_item, plan_entry, cook_log,
  shopping_check, household_invite, push_subscription
to authenticated;

-- ── Tiempo real ──────────────────────────────────────────────────────
-- Todo lo que dos sesiones del mismo hogar pueden ver cambiar en vivo.

alter publication supabase_realtime add table pantry_item;
alter publication supabase_realtime add table plan_entry;
alter publication supabase_realtime add table shopping_check;
alter publication supabase_realtime add table recipe;
alter publication supabase_realtime add table recipe_ingredient;
alter publication supabase_realtime add table household_invite;
