-- Las funciones RPC (save_recipe, buy_checked, finish_cook) llaman a
-- private.current_household() directamente, no solo desde una política RLS
-- (donde el nombre ya queda resuelto al crear la política). Necesitan
-- USAGE sobre el schema para poder resolver esa llamada en tiempo de
-- ejecución; EXECUTE en la función ya estaba concedido, pero no basta solo.
grant usage on schema private to authenticated;
