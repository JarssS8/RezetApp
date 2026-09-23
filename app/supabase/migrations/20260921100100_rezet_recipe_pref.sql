-- Diseño §8.1 — me gusta / no me gusta por persona.
--
-- Leer es de HOGAR y escribir es propio: el agregado ("gusta a 3 de 4") es
-- justo el producto, porque sirve para decidir qué se cocina. Esconder quién
-- votó qué crearía una ambigüedad peor en un grupo pequeño.

create table public.member_recipe_pref (
  member_id   uuid not null references public.member(id) on delete cascade,
  recipe_id   uuid not null references public.recipe(id) on delete cascade,
  rating      smallint not null check (rating in (-1, 1)),
  updated_at  timestamptz not null default now(),
  primary key (member_id, recipe_id)
);

create index member_recipe_pref_recipe_idx on public.member_recipe_pref (recipe_id);

alter table public.member_recipe_pref enable row level security;

create policy member_recipe_pref_select on public.member_recipe_pref for select
  to authenticated
  using (exists (
    select 1 from public.member m
     where m.id = member_recipe_pref.member_id
       and m.household_id = (select private.current_household())
  ));

-- Dos políticas sobre la misma tabla, una `for select` y otra `for all`, son
-- seguras porque Postgres solo combina con OR las políticas del MISMO
-- comando: la `select` de arriba (todo el hogar) nunca se suma a un INSERT/
-- UPDATE/DELETE, así que la única que rige la escritura es esta. Sin esto,
-- cualquiera del hogar podría votar por otro. Verificado en
-- `supabase/tests/migrations.test.ts` ("recipe_pref: cualquiera del hogar
-- lee el voto ajeno, pero nadie vota por otro").
create policy member_recipe_pref_write on public.member_recipe_pref for all
  to authenticated
  using ((select private.can_act_for(member_recipe_pref.member_id)))
  with check ((select private.can_act_for(member_recipe_pref.member_id)));

revoke all on public.member_recipe_pref from anon, authenticated;
grant select, insert, update, delete on public.member_recipe_pref to authenticated;
