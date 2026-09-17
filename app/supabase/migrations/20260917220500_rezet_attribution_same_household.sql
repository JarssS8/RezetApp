-- Auditoría run-2, hallazgo BAJO
-- (rezet-supabase:recipe.created_by+cook_log.cooked_by:cross-household-profile-fk-blocks-lifecycle-rpcs).
--
-- Un usuario podía crear en SU hogar una receta cuyo `created_by` apuntara al
-- perfil de otro hogar. La limpieza de leave_household()/delete_account() filtra
-- por hogar, así que nunca veía esa fila, y el borrado del perfil fallaba con
-- violación de clave foránea: la víctima quedaba sin poder salir ni borrarse.
--
-- El nombre de la columna llega como argumento del trigger y se lee de
-- to_jsonb(new): `new.created_by` se resolvería al planificar y reventaría en la
-- tabla que no tiene esa columna.

create or replace function private.attribution_same_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_attributed uuid;
  v_row_household uuid;
  v_profile_household uuid;
begin
  v_attributed    := nullif(v_row ->> tg_argv[0], '')::uuid;
  v_row_household := nullif(v_row ->> 'household_id', '')::uuid;

  if v_attributed is null then
    return new;
  end if;

  select household_id into v_profile_household
    from public.profile where id = v_attributed;

  if v_profile_household is distinct from v_row_household then
    raise exception 'REZET_ATTRIBUTION_FOREIGN_HOUSEHOLD';
  end if;

  return new;
end;
$$;

revoke all on function private.attribution_same_household() from public, anon, authenticated;

-- Limpieza de lo que ya pudiera existir antes de imponer la regla.
update public.recipe r set created_by = null
 where created_by is not null
   and not exists (select 1 from public.profile p
                    where p.id = r.created_by and p.household_id = r.household_id);

update public.cook_log c set cooked_by = null
 where cooked_by is not null
   and not exists (select 1 from public.profile p
                    where p.id = c.cooked_by and p.household_id = c.household_id);

drop trigger if exists recipe_attribution_trg on public.recipe;
create trigger recipe_attribution_trg
before insert or update of created_by, household_id on public.recipe
for each row execute function private.attribution_same_household('created_by');

drop trigger if exists cook_log_attribution_trg on public.cook_log;
create trigger cook_log_attribution_trg
before insert or update of cooked_by, household_id on public.cook_log
for each row execute function private.attribution_same_household('cooked_by');
