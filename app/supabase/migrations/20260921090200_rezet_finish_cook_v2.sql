-- Task 5 del plan de nutrición personal: `finish_cook_v2` escribe las
-- raciones de cada miembro DENTRO de la misma transacción que descuenta la
-- despensa. Hacerlo en una segunda llamada no vale: si esa segunda llamada
-- fallara, un "no lo cené" se perdería en silencio y el día de esa persona
-- quedaría inflado sin que nadie se enterase.
--
-- El cuerpo de abajo es una copia literal de `finish_cook` tal y como quedó
-- en 20260918100200_rezet_harden_transactional_rpcs.sql (líneas 155-260,
-- comprobado con
-- `grep -rln "function public.finish_cook" app/supabase/migrations/ | sort | tail -1`
-- justo antes de escribir esta migración: sigue siendo la definición más
-- reciente), con el bloqueo de fila del endurecimiento intacto. Los únicos
-- cambios respecto a esa copia son los que se documentan en cada punto.
--
-- `finish_cook` no puede cambiar de tipo de retorno: las PWA cacheadas
-- parsean su respuesta como array. Por eso la lógica nueva vive en
-- `finish_cook_v2`, que devuelve un objeto, y `finish_cook` se queda como
-- envoltorio con su firma intacta (ver el bloque final).
create or replace function public.finish_cook_v2(
  p_recipe_id uuid, p_servings integer, p_plan_entry_id uuid, p_today date, p_slot meal_slot,
  p_shares jsonb default '[]'::jsonb
)
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
  v_plan_entry_id uuid;
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
    -- Mismo contrato que la salida normal: un doble toque tiene que
    -- devolver un objeto, no el array de la versión anterior, o el
    -- envoltorio acaba devolviendo NULL a los clientes cacheados.
    return jsonb_build_object('shortages', '[]'::jsonb, 'plan_entry_id', p_plan_entry_id);
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
    v_plan_entry_id := p_plan_entry_id;
  else
    insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings, cooked_at, servings_cooked)
    values (v_household_id, p_today, p_slot, p_recipe_id, p_servings, now(), p_servings)
    returning id into v_plan_entry_id;
  end if;

  insert into public.cook_log (household_id, recipe_id, plan_entry_id, servings, shortages, cooked_by)
  values (v_household_id, p_recipe_id, p_plan_entry_id, p_servings, v_shortages, (select auth.uid()));

  -- Las raciones van DENTRO de esta transacción, no en una llamada aparte:
  -- si fallara la segunda, un "no lo cené" se perdería en silencio y el día
  -- de esa persona quedaría inflado sin que nadie se enterase.
  if jsonb_typeof(p_shares) = 'array' then
    insert into public.intake_share (member_id, plan_entry_id, servings)
    select d.member_id, v_plan_entry_id, d.servings
      from (
        -- El mismo miembro puede venir repetido en el array; el último
        -- valor gana, en vez de reventar el `on conflict` con dos filas
        -- para la misma clave (member_id, plan_entry_id).
        select distinct on ((s->>'member_id'))
               (s->>'member_id')::uuid as member_id,
               (s->>'servings')::numeric as servings
          from jsonb_array_elements(p_shares) with ordinality as t(s, ord)
         order by (s->>'member_id'), ord desc
      ) d
     where exists (
       select 1 from public.member m
        where m.id = d.member_id
          and m.household_id = v_household_id
          and m.deleted_at is null
     )
    on conflict (member_id, plan_entry_id) do update set
      servings = excluded.servings, updated_at = now();

    -- Un id que no es de este hogar no se ignora en silencio: se rechaza.
    if (select count(distinct s->>'member_id') from jsonb_array_elements(p_shares) as s) <>
       (select count(*) from public.intake_share where plan_entry_id = v_plan_entry_id) then
      raise exception 'REZET_FOREIGN_HOUSEHOLD: alguna ración no es de este hogar';
    end if;
  else
    -- p_shares que no es lista es justo el "se pierde en silencio" que esta
    -- tarea existe para evitar: se rechaza en vez de terminar bien sin
    -- escribir nada y sin avisar a nadie.
    raise exception 'REZET_BAD_SHARES: las raciones deben venir como lista';
  end if;

  return jsonb_build_object('shortages', v_shortages, 'plan_entry_id', v_plan_entry_id);
end;
$function$;

-- Envoltorio para las PWA cacheadas, que parsean el retorno como array. No
-- se puede cambiar el tipo de retorno de una función que ya está publicada
-- sin romperlas.
create or replace function public.finish_cook(
  p_recipe_id uuid, p_servings integer, p_plan_entry_id uuid, p_today date, p_slot meal_slot
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.finish_cook_v2(p_recipe_id, p_servings, p_plan_entry_id, p_today, p_slot, '[]'::jsonb) -> 'shortages'
$$;

revoke all on function public.finish_cook_v2(uuid, integer, uuid, date, meal_slot, jsonb) from public, anon;
grant execute on function public.finish_cook_v2(uuid, integer, uuid, date, meal_slot, jsonb) to authenticated;
revoke all on function public.finish_cook(uuid, integer, uuid, date, meal_slot) from public, anon;
grant execute on function public.finish_cook(uuid, integer, uuid, date, meal_slot) to authenticated;

-- La ración que alguien comió de una comida del hogar NO es un dato privado:
-- quien cocinó estaba delante y lo vio. Con la política por miembro, la
-- pantalla de fin de cocción ("cuenta para: …", con todo el hogar marcado)
-- era imposible en cualquier hogar con dos adultos, y además la violación de
-- RLS hacía rollback del descuento de despensa entero.
-- `intake_extra` (lo que cada uno come por su cuenta) SÍ se queda en nivel
-- propio: eso es lo que de verdad nadie tiene por qué ver.
drop policy if exists intake_share_rw on public.intake_share;
create policy intake_share_rw on public.intake_share for all
  to authenticated
  using (exists (
    select 1 from public.member m
     where m.id = intake_share.member_id
       and m.household_id = (select private.current_household())
  ))
  with check (exists (
    select 1 from public.member m
     where m.id = intake_share.member_id
       and m.household_id = (select private.current_household())
       and m.deleted_at is null
  ));
