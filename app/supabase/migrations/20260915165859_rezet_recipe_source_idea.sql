-- Lets "Guardar" on a catalog idea (Ideas tab) be idempotent per household:
-- the client checks recipe.source_idea_id before calling save_recipe again.
alter table public.recipe add column source_idea_id text null;

-- NULLs never collide (every user-created recipe has source_idea_id null), so this
-- only enforces "one copy per idea per household".
create unique index recipe_household_source_idea_uidx
  on public.recipe (household_id, source_idea_id)
  where source_idea_id is not null;

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
      photo_path, created_by, source_idea_id
    ) values (
      v_household_id,
      payload->>'name',
      coalesce(payload->>'description', ''),
      coalesce((payload->>'base_servings')::int, 2),
      coalesce((payload->>'minutes')::int, 20),
      coalesce((payload->>'difficulty')::public.difficulty, 'easy'),
      coalesce((payload->>'kcal_per_serving')::int, 450),
      nullif(payload->>'photo_path', ''),
      (select auth.uid()),
      nullif(payload->>'source_idea_id', '')
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
