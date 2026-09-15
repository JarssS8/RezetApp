-- Añadir un item a la despensa desde la hoja de "Añadir": si ya existe una
-- fila con el mismo ingrediente+unidad+ubicación (pantry_item_uq es un
-- índice único real sobre esas tres columnas), suma la cantidad en vez de
-- fallar o duplicar — igual que buy_checked ya hace para la lista de la
-- compra. Devuelve si fusionó o creó, y cuánto se añadió, para que el
-- deshacer del cliente sepa restar solo lo que esta llamada añadió, no
-- borrar la fila entera si ya tenía más cantidad de antes.
create or replace function public.pantry_add(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_unit public.unit,
  p_location public.pantry_loc,
  p_expires_on date
)
returns table (id uuid, merged boolean, added_quantity numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household();
  v_existing record;
begin
  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  select p.id, p.expires_on into v_existing
  from public.pantry_item p
  where p.household_id = v_household_id
    and p.ingredient_id = p_ingredient_id
    and p.unit = p_unit
    and p.location = p_location;

  if v_existing.id is not null then
    -- Conserva la fecha de caducidad que ya había si tenía una: no se puede
    -- representar "dos lotes con dos fechas" en una sola fila, así que se
    -- prioriza no perder una fecha real por una nueva o por null (mismo
    -- criterio implícito que ya tiene buy_checked, que ni siquiera toca
    -- expires_on al fusionar).
    update public.pantry_item
    set quantity = quantity + p_quantity,
        expires_on = coalesce(v_existing.expires_on, p_expires_on)
    where public.pantry_item.id = v_existing.id;
    return query select v_existing.id, true, p_quantity;
  else
    return query
      insert into public.pantry_item (household_id, ingredient_id, quantity, unit, location, expires_on)
      values (v_household_id, p_ingredient_id, p_quantity, p_unit, p_location, p_expires_on)
      returning pantry_item.id, false, p_quantity;
  end if;
end;
$$;

revoke all on function public.pantry_add(uuid, numeric, public.unit, public.pantry_loc, date) from public;
revoke execute on function public.pantry_add(uuid, numeric, public.unit, public.pantry_loc, date) from anon;
grant execute on function public.pantry_add(uuid, numeric, public.unit, public.pantry_loc, date) to authenticated;
