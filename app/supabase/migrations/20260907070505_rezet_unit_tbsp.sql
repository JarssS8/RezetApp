-- RecipeForm/PantryAdd offer `tbsp` (cda) as a unit (commit 19fa0e6), but the
-- `unit` enum never got it — saving a real recipe/pantry item with cda failed
-- with 22P02. Additive-only value, no data migration needed.
alter type public.unit add value if not exists 'tbsp';
