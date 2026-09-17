-- Auditoría run-2, hallazgo BAJO
-- (rezet-supabase:realtime:shopping_check-delete-events-leak-household-and-item-key).
--
-- La clave primaria era (household_id, item_key) y Realtime no aplica RLS a los
-- DELETE, así que cualquier suscriptor recibía el UUID del hogar ajeno y la
-- clave del artículo. Con una clave subrogada el evento solo lleva un id opaco.
--
-- Las tres sentencias deben aplicarse en la misma transacción (supabase db push
-- envuelve cada fichero en una): la tabla está publicada en supabase_realtime y
-- no puede quedarse sin clave primaria entre sentencia y sentencia.

alter table public.shopping_check add column if not exists id uuid not null default gen_random_uuid();
alter table public.shopping_check drop constraint if exists shopping_check_pkey;
alter table public.shopping_check add constraint shopping_check_pkey primary key (id);
alter table public.shopping_check add constraint shopping_check_household_item_key
  unique (household_id, item_key);
