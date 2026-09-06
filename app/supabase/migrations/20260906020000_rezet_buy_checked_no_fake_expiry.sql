-- buy_checked ya no inventa una fecha de caducidad de "+5 días" para lo
-- comprado en frío: antes era un número fijo que nunca se recalculaba
-- (inofensivo); ahora que las fechas son reales y se recalculan en cada
-- lectura, esa suposición envejecería hasta decir "Caducado" en falso
-- sobre comida que nunca tuvo una fecha real. Se deja sin fecha
-- ("sin fecha") hasta que el usuario ponga una de verdad.
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
      null
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
