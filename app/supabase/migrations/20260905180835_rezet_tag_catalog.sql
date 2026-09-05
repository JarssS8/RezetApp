-- Catálogo de etiquetas por hogar, igual que ya hacemos con ingredient:
-- una sola fuente de verdad por nombre (sin distinguir mayúsculas/tildes),
-- así el filtro de Recetas y las sugerencias del formulario leen exactamente
-- lo mismo y "Rápido"/"rápido" no acaban siendo dos etiquetas distintas.

create table tag (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);
create unique index tag_name_uq on tag (household_id, lower(name));
create index tag_household_id_idx on tag (household_id);

alter table tag enable row level security;

create policy tag_select on tag for select
  to authenticated using (household_id = (select private.current_household()));
create policy tag_insert on tag for insert
  to authenticated with check (household_id = (select private.current_household()));
create policy tag_update on tag for update
  to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));
create policy tag_delete on tag for delete
  to authenticated using (household_id = (select private.current_household()));

grant select, insert, update, delete on tag to authenticated;

-- Backfill defensivo (hoy no hay filas reales en recipe_tag, pero por si acaso).
insert into tag (household_id, name)
select distinct r.household_id, rt.tag
from recipe_tag rt
join recipe r on r.id = rt.recipe_id
on conflict (household_id, lower(name)) do nothing;

alter table recipe_tag add column tag_id uuid references tag(id) on delete cascade;

update recipe_tag rt
set tag_id = t.id
from recipe r, tag t
where r.id = rt.recipe_id
  and t.household_id = r.household_id
  and lower(t.name) = lower(rt.tag);

alter table recipe_tag drop constraint recipe_tag_pkey;
alter table recipe_tag alter column tag_id set not null;
alter table recipe_tag drop column tag;
alter table recipe_tag add primary key (recipe_id, tag_id);
create index recipe_tag_tag_id_idx on recipe_tag (tag_id);

alter publication supabase_realtime add table tag;
