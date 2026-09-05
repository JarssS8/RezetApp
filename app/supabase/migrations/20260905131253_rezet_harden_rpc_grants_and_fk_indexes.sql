-- anon no debe poder ni intentar llamar a estas RPC (el cuerpo las rechaza,
-- pero no deben aparecer expuestas sin sesión).
revoke execute on function public.create_household(text, text) from anon;
revoke execute on function public.redeem_invite(text, text) from anon;

-- Índices en columnas FK que el advisor de performance señaló sin cubrir.
create index cook_log_cooked_by_idx on cook_log (cooked_by);
create index cook_log_plan_entry_id_idx on cook_log (plan_entry_id);
create index household_invite_created_by_idx on household_invite (created_by);
create index household_invite_used_by_idx on household_invite (used_by);
create index recipe_created_by_idx on recipe (created_by);
create index recipe_step_ingredient_recipe_ingredient_id_idx on recipe_step_ingredient (recipe_ingredient_id);
