-- M4 — Contrato transaccional de BUILD_FROM_ZERO.md §5.
-- Todas SECURITY INVOKER: el llamante ya está limitado a su propio hogar por
-- las políticas RLS de cada tabla; estas funciones solo añaden la atomicidad
-- que una secuencia de llamadas normales de PostgREST no puede dar.

-- ── save_recipe ─────────────────────────────────────────────────────────
-- El parseo de texto -> ingredientes/pasos sigue viviendo en el cliente
-- (domain/recipeText.ts, con tests); esta función solo hace atómico el
-- upsert de receta + tags + ingredientes + pasos, y resuelve/crea
-- ingredientes por nombre igual que resolveIngredient() en el store local.

create or replace function public.save_recipe(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household();
  v_recipe_id uuid;
  v_ingredient jsonb;
  v_step jsonb;
  v_tag text;
  v_ingredient_id uuid;
  v_position int;
begin
  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  v_recipe_id := nullif(payload->>'id', '')::uuid;

  if v_recipe_id is not null then
    update public.recipe set
      name = payload->>'name',
      description = coalesce(payload->>'description', ''),
      base_servings = coalesce((payload->>'base_servings')::int, 2),
      minutes = coalesce((payload->>'minutes')::int, 20),
      difficulty = coalesce((payload->>'difficulty')::public.difficulty, 'easy'),
      kcal_per_serving = coalesce((payload->>'kcal_per_serving')::int, 450)
    where id = v_recipe_id and household_id = v_household_id;

    if not found then
      raise exception 'recipe not found in this household';
    end if;

    delete from public.recipe_tag where recipe_id = v_recipe_id;
    delete from public.recipe_ingredient where recipe_id = v_recipe_id;
    delete from public.recipe_step where recipe_id = v_recipe_id;
  else
    insert into public.recipe (
      household_id, name, description, base_servings, minutes, difficulty, kcal_per_serving, created_by
    ) values (
      v_household_id,
      payload->>'name',
      coalesce(payload->>'description', ''),
      coalesce((payload->>'base_servings')::int, 2),
      coalesce((payload->>'minutes')::int, 20),
      coalesce((payload->>'difficulty')::public.difficulty, 'easy'),
      coalesce((payload->>'kcal_per_serving')::int, 450),
      (select auth.uid())
    )
    returning id into v_recipe_id;
  end if;

  for v_tag in select jsonb_array_elements_text(coalesce(payload->'tags', '[]'::jsonb))
  loop
    insert into public.recipe_tag (recipe_id, tag) values (v_recipe_id, v_tag)
    on conflict do nothing;
  end loop;

  v_position := 0;
  for v_ingredient in select jsonb_array_elements(coalesce(payload->'ingredients', '[]'::jsonb))
  loop
    select id into v_ingredient_id
    from public.ingredient
    where (household_id = v_household_id or household_id is null)
      and lower(name_es) = lower(v_ingredient->>'name')
    order by household_id nulls last
    limit 1;

    if v_ingredient_id is null then
      insert into public.ingredient (household_id, name_es, name_en, default_unit, is_sensitive)
      values (
        v_household_id,
        v_ingredient->>'name',
        v_ingredient->>'name',
        (v_ingredient->>'unit')::public.unit,
        coalesce((v_ingredient->>'sensitive')::boolean, false)
      )
      returning id into v_ingredient_id;
    end if;

    insert into public.recipe_ingredient (recipe_id, ingredient_id, quantity, unit, position)
    values (
      v_recipe_id, v_ingredient_id,
      (v_ingredient->>'quantity')::numeric, (v_ingredient->>'unit')::public.unit, v_position
    );

    v_position := v_position + 1;
  end loop;

  v_position := 0;
  for v_step in select jsonb_array_elements(coalesce(payload->'steps', '[]'::jsonb))
  loop
    insert into public.recipe_step (recipe_id, position, text, timer_minutes)
    values (v_recipe_id, v_position, v_step->>'text', nullif(v_step->>'timer_minutes', '')::int);
    v_position := v_position + 1;
  end loop;

  return v_recipe_id;
end;
$$;

revoke all on function public.save_recipe(jsonb) from public;
revoke execute on function public.save_recipe(jsonb) from anon;
grant execute on function public.save_recipe(jsonb) to authenticated;

-- ── buy_checked ─────────────────────────────────────────────────────────

create or replace function public.buy_checked(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household();
  v_item jsonb;
  v_ingredient_id uuid;
  v_unit public.unit;
  v_location public.pantry_loc;
  v_quantity numeric;
begin
  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  for v_item in select jsonb_array_elements(p_items)
  loop
    v_ingredient_id := (v_item->>'ingredient_id')::uuid;
    v_unit := (v_item->>'unit')::public.unit;
    v_location := (v_item->>'location')::public.pantry_loc;
    v_quantity := (v_item->>'quantity')::numeric;

    insert into public.pantry_item (household_id, ingredient_id, quantity, unit, location, expires_on)
    values (
      v_household_id, v_ingredient_id, v_quantity, v_unit, v_location,
      case when v_location = 'fridge' then (current_date + 5) else null end
    )
    on conflict (household_id, ingredient_id, unit, location)
    do update set quantity = public.pantry_item.quantity + excluded.quantity;

    delete from public.shopping_check
    where household_id = v_household_id
      and item_key = v_ingredient_id::text || '|' || v_unit::text;
  end loop;
end;
$$;

revoke all on function public.buy_checked(jsonb) from public;
revoke execute on function public.buy_checked(jsonb) from anon;
grant execute on function public.buy_checked(jsonb) to authenticated;

-- ── finish_cook ─────────────────────────────────────────────────────────
-- p_today / p_slot los calcula el cliente con domain/dates.ts (todayKey,
-- slotForNow): son horarios LOCALES del hogar, y el servidor no tiene forma
-- de saber la zona horaria del cliente si no se los pasan.

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

  -- Idempotencia: si ya estaba cocinada, no se vuelve a restar.
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

    -- Igual que el store local: toca UNA fila de despensa (household_id,
    -- ingredient_id, unit), nunca por debajo de 0; se borra si llega a 0.
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

revoke all on function public.finish_cook(uuid, int, uuid, date, public.meal_slot) from public;
revoke execute on function public.finish_cook(uuid, int, uuid, date, public.meal_slot) from anon;
grant execute on function public.finish_cook(uuid, int, uuid, date, public.meal_slot) to authenticated;
