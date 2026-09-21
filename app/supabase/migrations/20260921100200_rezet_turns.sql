-- Diseño §10 — turnos de cocina y compra. Opcionales y APAGADOS por
-- defecto: un hogar de dos personas no necesita coordinarse y no tiene por
-- qué cargar con una función de coordinación.
--
-- Nada de lo que hay aquí afecta a la despensa, a la compra ni a las
-- calorías. Es informativo, y así debe quedarse.

alter table public.household add column turns_enabled boolean not null default false;

alter table public.plan_entry add column cook_member_id uuid references public.member(id) on delete set null;
create index plan_entry_cook_member_idx on public.plan_entry (cook_member_id);

-- cook_member_id no debe poder apuntar a un miembro de otro hogar: el FK a
-- secas no filtra por hogar (mismo problema que resolvió 20260919100400
-- para recipe_id/ingredient_id/etc. en esta misma tabla). USING no cambia;
-- solo se añade la comprobación del nuevo FK al WITH CHECK ya existente.
alter policy plan_entry_rw on public.plan_entry
  with check (
    household_id = (select private.current_household())
    and exists (select 1 from public.recipe r
                 where r.id = plan_entry.recipe_id and r.household_id = (select private.current_household()))
    and (plan_entry.cook_member_id is null
         or exists (select 1 from public.member m
                     where m.id = plan_entry.cook_member_id
                       and m.household_id = (select private.current_household())))
  );

create table public.shopping_turn (
  household_id uuid not null references public.household(id) on delete cascade,
  week_start   date not null,
  member_id    uuid not null references public.member(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  primary key (household_id, week_start)
);

-- Igual que arriba: member_id es una FK sin filtro de hogar, así que el
-- WITH CHECK es quien impide asignarle el turno a alguien de otro hogar
-- (patrón común del diseño, "toda FK que cruce hogares se comprueba con el
-- mismo enfoque de 20260919100400").
alter table public.shopping_turn enable row level security;
create policy shopping_turn_rw on public.shopping_turn for all
  to authenticated
  using (household_id = (select private.current_household()))
  with check (
    household_id = (select private.current_household())
    and exists (select 1 from public.member m
                 where m.id = shopping_turn.member_id
                   and m.household_id = (select private.current_household()))
  );

revoke all on public.shopping_turn from anon, authenticated;
grant select, insert, update, delete on public.shopping_turn to authenticated;

-- Grants de columna en household y plan_entry: las dos ya tenían un grant
-- vivo (de tabla en plan_entry desde el esquema base; columna a columna en
-- household desde 20260918100100), y `revoke update (columna)` no hace nada
-- mientras siga vivo el de tabla (20260917070714 → 20260917070845, el repo
-- ya se equivocó una vez con esto). Se revoca el de tabla/columna previo y
-- se reconcede exactamente lo que ya era editable, más la columna nueva —
-- ninguna columna que ya se pudiera escribir deja de poder escribirse.

revoke update on public.household from authenticated;
grant update (name, kcal_target, turns_enabled) on public.household to authenticated;

revoke update on public.plan_entry from authenticated;
grant update (
  id, household_id, on_date, slot, recipe_id, servings, cooked_at,
  servings_cooked, position, created_at, cook_member_id
) on public.plan_entry to authenticated;
