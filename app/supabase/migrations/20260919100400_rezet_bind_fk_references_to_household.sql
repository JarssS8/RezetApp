-- Auditoría run-3 (rezet-supabase:rls:household-scoped-fk-columns-accept-foreign-household-ids).
-- Las políticas solo ataban el household_id de la propia fila (o la receta o
-- el paso padre). La comprobación de FK corre sin RLS, así que una fila podía
-- apuntar a una receta, ingrediente o etiqueta de otro hogar: oráculo de
-- existencia y de borrado para un ex-miembro que conserve UUIDs, y el
-- comentario de 20260915090220 suponía justo lo contrario.
--
-- Cada WITH CHECK exige ahora que el objeto referenciado sea del hogar (o del
-- catálogo global, para ingredientes). Las subconsultas corren con el RLS de
-- quien llama, así que un objeto ajeno ni se ve. USING no cambia.
-- save_recipe, pantry_add, buy_checked y finish_cook son SECURITY INVOKER y
-- heredan estas comprobaciones.

alter policy plan_entry_rw on public.plan_entry
  with check (
    household_id = (select private.current_household())
    and exists (select 1 from public.recipe r
                 where r.id = plan_entry.recipe_id and r.household_id = (select private.current_household()))
  );

alter policy pantry_item_rw on public.pantry_item
  with check (
    household_id = (select private.current_household())
    and exists (select 1 from public.ingredient i
                 where i.id = pantry_item.ingredient_id
                   and (i.household_id = (select private.current_household()) or i.household_id is null))
  );

alter policy recipe_ingredient_rw on public.recipe_ingredient
  with check (
    exists (select 1 from public.recipe r
             where r.id = recipe_ingredient.recipe_id and r.household_id = (select private.current_household()))
    and exists (select 1 from public.ingredient i
                 where i.id = recipe_ingredient.ingredient_id
                   and (i.household_id = (select private.current_household()) or i.household_id is null))
  );

alter policy recipe_tag_rw on public.recipe_tag
  with check (
    exists (select 1 from public.recipe r
             where r.id = recipe_tag.recipe_id and r.household_id = (select private.current_household()))
    and exists (select 1 from public.tag t
                 where t.id = recipe_tag.tag_id and t.household_id = (select private.current_household()))
  );

alter policy recipe_step_ingredient_rw on public.recipe_step_ingredient
  with check (
    exists (select 1 from public.recipe_step s
              join public.recipe_ingredient ri on ri.recipe_id = s.recipe_id
              join public.recipe r on r.id = s.recipe_id
             where s.id = recipe_step_ingredient.step_id
               and ri.id = recipe_step_ingredient.recipe_ingredient_id
               and r.household_id = (select private.current_household()))
  );

alter policy cook_log_insert on public.cook_log
  with check (
    household_id = (select private.current_household())
    and exists (select 1 from public.recipe r
                 where r.id = cook_log.recipe_id and r.household_id = (select private.current_household()))
    and (cook_log.plan_entry_id is null
         or exists (select 1 from public.plan_entry p
                     where p.id = cook_log.plan_entry_id and p.household_id = (select private.current_household())))
  );

alter policy cook_timer_rw on public.cook_timer
  with check (
    profile_id = (select auth.uid())
    and household_id = (select private.current_household())
    and exists (select 1 from public.recipe r
                 where r.id = cook_timer.recipe_id and r.household_id = (select private.current_household()))
  );
