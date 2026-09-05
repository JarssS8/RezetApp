-- CREATE FUNCTION no valida las expresiones SQL embebidas en el cuerpo de una
-- función plpgsql hasta su primera ejecución. La primera versión de
-- finish_cook colaba un operador `|>` que no existe en Postgres dentro de la
-- rama de shortages; la migración se aplicó "bien" pero habría explotado en
-- cuanto alguien cocinara algo con un ingrediente faltante. Corregido aquí.
create or replace function public.finish_cook(
  p_recipe_id uuid,
  p_servings int,
  p_plan_entry_id uuid,
  p_today date,
  p_slot public.meal_slot
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household();
  v_locale text;
  v_base_servings int;
  v_factor numeric;
  v_already_cooked boolean := false;
  v_ri record;
  v_need numeric;
  v_have numeric;
  v_shortages jsonb := '[]'::jsonb;
begin
  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  select locale into v_locale from public.profile where id = (select auth.uid());

  select base_servings into v_base_servings
  from public.recipe where id = p_recipe_id and household_id = v_household_id;
  if not found then
    raise exception 'recipe not found in this household';
  end if;

  if p_plan_entry_id is not null then
    select (cooked_at is not null) into v_already_cooked
    from public.plan_entry
    where id = p_plan_entry_id and household_id = v_household_id;
    if not found then
      raise exception 'plan entry not found in this household';
    end if;
  end if;

  if v_already_cooked then
    return '[]'::jsonb;
  end if;

  v_factor := p_servings::numeric / nullif(v_base_servings, 0);

  for v_ri in
    select ri.ingredient_id, ri.quantity, ri.unit, coalesce(i.is_sensitive, false) as is_sensitive,
           coalesce(i.name_es, '') as name_es, coalesce(i.name_en, '') as name_en
    from public.recipe_ingredient ri
    join public.ingredient i on i.id = ri.ingredient_id
    where ri.recipe_id = p_recipe_id
  loop
    v_need := case when v_ri.is_sensitive
      then v_ri.quantity * power(v_factor, 0.55)
      else v_ri.quantity * v_factor
    end;

    select coalesce(sum(quantity), 0) into v_have
    from public.pantry_item
    where household_id = v_household_id and ingredient_id = v_ri.ingredient_id and unit = v_ri.unit;

    if v_have < v_need * 0.999 then
      v_shortages := v_shortages || jsonb_build_object(
        'name', case
          when v_locale = 'en' and nullif(v_ri.name_en, '') is not null then v_ri.name_en
          else v_ri.name_es
        end,
        'quantity', round((v_need - v_have)::numeric, 2),
        'unit', v_ri.unit
      );
    end if;

    update public.pantry_item
    set quantity = greatest(0, quantity - v_need)
    where id = (
      select id from public.pantry_item
      where household_id = v_household_id and ingredient_id = v_ri.ingredient_id and unit = v_ri.unit
      order by id
      limit 1
    );

    delete from public.pantry_item
    where household_id = v_household_id and ingredient_id = v_ri.ingredient_id
      and unit = v_ri.unit and quantity <= 0;
  end loop;

  update public.recipe set cooked_count = cooked_count + 1
  where id = p_recipe_id and household_id = v_household_id;

  if p_plan_entry_id is not null then
    update public.plan_entry
    set cooked_at = now(), servings_cooked = p_servings, servings = p_servings
    where id = p_plan_entry_id and household_id = v_household_id;
  else
    insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings, cooked_at, servings_cooked)
    values (v_household_id, p_today, p_slot, p_recipe_id, p_servings, now(), p_servings);
  end if;

  insert into public.cook_log (household_id, recipe_id, plan_entry_id, servings, shortages, cooked_by)
  values (v_household_id, p_recipe_id, p_plan_entry_id, p_servings, v_shortages, (select auth.uid()));

  return v_shortages;
end;
$$;
