-- Diseño §3.3: tres endurecimientos independientes sobre RPC transaccionales
-- que ya existían. Cada función se redeclara con `create or replace
-- function` copiando el cuerpo vigente tal cual (ver la tabla de ficheros y
-- líneas en la Task C3 del plan) y solo se toca lo que se documenta en cada
-- bloque. save_recipe y finish_cook son SECURITY INVOKER en el original: no
-- se declara `security definer` aquí para no saltarse las políticas RLS de
-- las que dependen.

-- ── save_recipe(payload jsonb): valida photo_path dentro del jsonb ──
-- La ruta la manda el cliente y acaba en el bucket compartido `recipe-photos`
-- (RecipeForm.tsx:137 e IdeaDetail.tsx:57 construyen
-- `${householdId}/${crypto.randomUUID()}.${ext}`). Sin esta comprobación,
-- cualquier household autenticado podría guardar una receta apuntando a la
-- carpeta de otro hogar, o intentar escapar de `recipe-photos` con `..`. Se
-- escribe una sola vez, arriba, porque el valor se usa en dos ramas más abajo
-- (update en la línea ~41 del original, insert en la ~63).
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

  -- La ruta la elige el cliente y acaba en un bucket compartido: solo se acepta
  -- dentro de la carpeta del propio hogar.
  if nullif(payload->>'photo_path', '') is not null and (
       payload->>'photo_path' !~ ('^' || v_household_id::text || '/')
       or position('..' in payload->>'photo_path') > 0
     ) then
    raise exception 'REZET_INVALID_PHOTO_PATH';
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

-- ── finish_cook(...): bloquea la fila del plan_entry antes de leerla ──
-- Dos finish_cook concurrentes sobre el mismo plan_entry (doble tap, dos
-- pestañas) podían leer `cooked_at is null` a la vez y descontar la despensa
-- dos veces. `for update` serializa esa lectura: el segundo espera a que el
-- primero confirme y ve `cooked_at` ya puesto.
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
    where id = p_plan_entry_id and household_id = v_household_id
    for update;
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

-- ── leave_household() / delete_account(): bloquean la fila del hogar antes
-- de contar miembros y admins ──
-- Copiadas desde 20260917220200_rezet_server_minted_invites.sql (la versión
-- vigente de la Fase A, con el borrado de invitaciones pendientes del que se
-- va), no desde la versión más antigua de
-- 20260907181314_rezet_multi_admin_household_and_delete_account.sql, que no
-- tiene ese borrado. Dos salidas/borrados concurrentes del mismo hogar podían
-- contar miembros/admins con la misma foto y dejar un hogar sin ningún
-- admin, o dos "último miembro" corriendo la rama equivocada a la vez.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
  v_member_count int;
  v_admin_count int;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  perform 1 from public.household where id = v_household_id for update;

  select count(*) into v_member_count from public.profile where household_id = v_household_id;

  if v_member_count <= 1 then
    raise exception 'REZET_SOLE_MEMBER: eres el único miembro de este hogar: bórralo en vez de abandonarlo';
  end if;

  if v_is_admin then
    select count(*) into v_admin_count
      from public.profile where household_id = v_household_id and is_admin = true;

    if v_admin_count <= 1 then
      raise exception 'REZET_LAST_ADMIN: eres el único administrador de este hogar y quedan otros miembros: dale el rol de administrador a alguien más antes de salir';
    end if;
  end if;

  update public.recipe set created_by = null
    where household_id = v_household_id and created_by = v_uid;
  update public.cook_log set cooked_by = null
    where household_id = v_household_id and cooked_by = v_uid;
  -- Las invitaciones pendientes de quien se va dejan de servir. Tiene que ir
  -- antes de anular `created_by`: después ya no hay forma de saber cuáles eran
  -- suyas.
  delete from public.household_invite
   where household_id = v_household_id
     and created_by = v_uid
     and used_at is null;
  update public.household_invite set created_by = null
    where household_id = v_household_id and created_by = v_uid;
  update public.household_invite set used_by = null
    where household_id = v_household_id and used_by = v_uid;

  delete from public.profile where id = v_uid;
end;
$$;

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
  v_member_count int;
  v_admin_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is not null then
    perform 1 from public.household where id = v_household_id for update;

    select count(*) into v_member_count from public.profile where household_id = v_household_id;

    if v_is_admin and v_member_count > 1 then
      select count(*) into v_admin_count
        from public.profile where household_id = v_household_id and is_admin = true;

      if v_admin_count <= 1 then
        raise exception 'REZET_LAST_ADMIN: eres el único administrador de este hogar y quedan otros miembros: dale el rol de administrador a alguien más antes de borrar tu cuenta';
      end if;
    end if;

    if v_member_count <= 1 then
      update public.recipe set created_by = null
        where household_id = v_household_id;
      update public.cook_log set cooked_by = null
        where household_id = v_household_id;
      update public.household_invite set created_by = null, used_by = null
        where household_id = v_household_id;

      delete from public.profile where household_id = v_household_id;
      delete from public.household where id = v_household_id;
    else
      update public.recipe set created_by = null
        where household_id = v_household_id and created_by = v_uid;
      update public.cook_log set cooked_by = null
        where household_id = v_household_id and cooked_by = v_uid;
      -- Las invitaciones pendientes de quien se va dejan de servir. Tiene que ir
      -- antes de anular `created_by`: después ya no hay forma de saber cuáles eran
      -- suyas.
      delete from public.household_invite
       where household_id = v_household_id
         and created_by = v_uid
         and used_at is null;
      update public.household_invite set created_by = null
        where household_id = v_household_id and created_by = v_uid;
      update public.household_invite set used_by = null
        where household_id = v_household_id and used_by = v_uid;

      delete from public.profile where id = v_uid;
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;
