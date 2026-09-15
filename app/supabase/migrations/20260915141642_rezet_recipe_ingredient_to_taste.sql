-- "Al gusto" ingredients: quantity/unit become optional, gated by to_taste.
-- Invariant enforced in the DB, not just app code: to_taste rows carry no
-- amount, non-to_taste rows always do.
alter table public.recipe_ingredient
  alter column quantity drop not null,
  alter column unit drop not null,
  add column to_taste boolean not null default false;

alter table public.recipe_ingredient
  add constraint recipe_ingredient_to_taste_check
  check (
    (to_taste and quantity is null and unit is null)
    or (not to_taste and quantity is not null and unit is not null)
  );

create or replace function public.save_recipe(payload jsonb)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_household_id uuid := private.current_household();
  v_recipe_id uuid;
  v_ingredient jsonb;
  v_step jsonb;
  v_tag text;
  v_tag_id uuid;
  v_ingredient_id uuid;
  v_position int;
  v_to_taste boolean;
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
      kcal_per_serving = coalesce((payload->>'kcal_per_serving')::int, 450),
      photo_path = coalesce(nullif(payload->>'photo_path', ''), photo_path)
    where id = v_recipe_id and household_id = v_household_id;

    if not found then
      raise exception 'recipe not found in this household';
    end if;

    delete from public.recipe_tag where recipe_id = v_recipe_id;
    delete from public.recipe_ingredient where recipe_id = v_recipe_id;
    delete from public.recipe_step where recipe_id = v_recipe_id;
  else
    insert into public.recipe (
      household_id, name, description, base_servings, minutes, difficulty, kcal_per_serving,
      photo_path, created_by
    ) values (
      v_household_id,
      payload->>'name',
      coalesce(payload->>'description', ''),
      coalesce((payload->>'base_servings')::int, 2),
      coalesce((payload->>'minutes')::int, 20),
      coalesce((payload->>'difficulty')::public.difficulty, 'easy'),
      coalesce((payload->>'kcal_per_serving')::int, 450),
      nullif(payload->>'photo_path', ''),
      (select auth.uid())
    )
    returning id into v_recipe_id;
  end if;

  -- Etiquetas: resolver-o-crear en el catálogo del hogar, igual que ingredientes.
  for v_tag in select jsonb_array_elements_text(coalesce(payload->'tags', '[]'::jsonb))
  loop
    select id into v_tag_id
    from public.tag
    where household_id = v_household_id and lower(name) = lower(v_tag)
    limit 1;

    if v_tag_id is null then
      insert into public.tag (household_id, name) values (v_household_id, v_tag)
      returning id into v_tag_id;
    end if;

    insert into public.recipe_tag (recipe_id, tag_id) values (v_recipe_id, v_tag_id)
    on conflict do nothing;
  end loop;

  v_position := 0;
  for v_ingredient in select jsonb_array_elements(coalesce(payload->'ingredients', '[]'::jsonb))
  loop
    v_to_taste := coalesce((v_ingredient->>'to_taste')::boolean, false);

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
        -- "al gusto" puede no traer unidad; default_unit del catálogo no es nullable,
        -- así que cae a 'g' — no afecta a esta fila de recipe_ingredient, que sí queda null.
        coalesce((v_ingredient->>'unit')::public.unit, 'g'::public.unit),
        coalesce((v_ingredient->>'sensitive')::boolean, false)
      )
      returning id into v_ingredient_id;
    end if;

    insert into public.recipe_ingredient (recipe_id, ingredient_id, quantity, unit, position, to_taste)
    values (
      v_recipe_id, v_ingredient_id,
      case when v_to_taste then null else (v_ingredient->>'quantity')::numeric end,
      case when v_to_taste then null else (v_ingredient->>'unit')::public.unit end,
      v_position,
      v_to_taste
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
$function$;

create or replace function public.finish_cook(p_recipe_id uuid, p_servings integer, p_plan_entry_id uuid, p_today date, p_slot meal_slot)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
    select ri.ingredient_id, ri.quantity, ri.unit, ri.to_taste, coalesce(i.is_sensitive, false) as is_sensitive,
           coalesce(i.name_es, '') as name_es, coalesce(i.name_en, '') as name_en
    from public.recipe_ingredient ri
    join public.ingredient i on i.id = ri.ingredient_id
    where ri.recipe_id = p_recipe_id
  loop
    -- "Al gusto": nada que descontar de la despensa, nunca hay carencia que avisar.
    continue when v_ri.to_taste;

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
$function$;
