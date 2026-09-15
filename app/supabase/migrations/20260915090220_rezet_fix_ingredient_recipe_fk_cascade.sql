-- Rezet — fix NO ACTION FKs that broke delete_household()/delete_account().
--
-- Audited every FK in public (pg_constraint via pg_get_constraintdef) against
-- what delete_household()/delete_account() actually null-out vs. rely on
-- cascade for. Found 3 FKs left as the implicit default (NO ACTION) where the
-- referenced row is ALSO being deleted in the same statement via a different
-- cascade path (household -> ingredient / household -> recipe), racing
-- against the referencing row's own cascade path:
--
--   pantry_item.ingredient_id     -> ingredient(id)   -- pantry_item cascades
--                                                         from household_id
--                                                         directly; ingredient
--                                                         cascades from
--                                                         household_id too —
--                                                         no ordering
--                                                         guarantee between
--                                                         the two paths.
--   recipe_ingredient.ingredient_id -> ingredient(id) -- recipe_ingredient
--                                                         cascades from
--                                                         recipe_id -> recipe
--                                                         (household cascade);
--                                                         ingredient cascades
--                                                         from household_id
--                                                         directly. Same race.
--   cook_log.recipe_id            -> recipe(id)       -- cook_log cascades
--                                                         from household_id
--                                                         directly; recipe
--                                                         cascades from
--                                                         household_id too.
--                                                         Same race.
--
-- All three become ON DELETE CASCADE: the referencing row is always destined
-- to be deleted anyway once its household goes (it can't reference an
-- ingredient/recipe outside its own household — RLS never lets it see one),
-- so cascading here just removes the ordering dependency instead of changing
-- what ends up deleted.
--
-- Left untouched (verified deliberate, not a gap): recipe.created_by,
-- cook_log.cooked_by, household_invite.created_by/used_by all stay NO ACTION
-- — they're attribution to a profile, not ownership, and
-- delete_household()/leave_household()/delete_account() already null them
-- explicitly before the profile delete so a user leaving/deleting their
-- account doesn't take shared recipes/history down with them.

alter table pantry_item
  drop constraint pantry_item_ingredient_id_fkey,
  add constraint pantry_item_ingredient_id_fkey
    foreign key (ingredient_id) references ingredient(id) on delete cascade;

alter table recipe_ingredient
  drop constraint recipe_ingredient_ingredient_id_fkey,
  add constraint recipe_ingredient_ingredient_id_fkey
    foreign key (ingredient_id) references ingredient(id) on delete cascade;

alter table cook_log
  drop constraint cook_log_recipe_id_fkey,
  add constraint cook_log_recipe_id_fkey
    foreign key (recipe_id) references recipe(id) on delete cascade;
