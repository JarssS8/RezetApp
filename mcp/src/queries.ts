import type { SupabaseClient } from '@supabase/supabase-js';
import { mapIngredient, mapPantryItem, mapPlanEntry, mapRecipe, RECIPE_SELECT, type RecipeRow } from './mappers';
import type { Ingredient, PantryItem, PlanEntry, Recipe } from '../../app/src/types';

export async function loadIngredients(supabase: SupabaseClient, householdId: string): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredient')
    .select('id, name_es, name_en, food_group, default_unit, is_sensitive')
    .or(`household_id.eq.${householdId},household_id.is.null`);
  if (error) throw error;
  return (data ?? []).map(mapIngredient);
}

export async function loadRecipes(supabase: SupabaseClient, householdId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipe')
    .select(RECIPE_SELECT)
    .eq('household_id', householdId)
    .is('archived_at', null);
  if (error) throw error;
  return (data ?? []).map((r) => mapRecipe(r as unknown as RecipeRow, supabase));
}

export async function loadPantry(supabase: SupabaseClient, householdId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_item')
    .select('id, ingredient_id, quantity, unit, location, expires_on')
    .eq('household_id', householdId);
  if (error) throw error;
  return (data ?? []).map(mapPantryItem);
}

export async function loadPlan(supabase: SupabaseClient, householdId: string): Promise<PlanEntry[]> {
  const { data, error } = await supabase
    .from('plan_entry')
    .select('id, on_date, slot, recipe_id, servings, cooked_at')
    .eq('household_id', householdId);
  if (error) throw error;
  return (data ?? []).map(mapPlanEntry);
}

export async function loadShoppingChecks(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('shopping_check')
    .select('item_key')
    .eq('household_id', householdId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.item_key as string, true])) as Record<string, boolean>;
}

export interface Snapshot {
  ingredients: Ingredient[];
  recipes: Recipe[];
  pantry: PantryItem[];
  plan: PlanEntry[];
  checked: Record<string, boolean>;
  recipeById: Map<string, Recipe>;
  ingredientById: Map<string, Ingredient>;
}

export async function loadSnapshot(supabase: SupabaseClient, householdId: string): Promise<Snapshot> {
  const [ingredients, recipes, pantry, plan, checked] = await Promise.all([
    loadIngredients(supabase, householdId),
    loadRecipes(supabase, householdId),
    loadPantry(supabase, householdId),
    loadPlan(supabase, householdId),
    loadShoppingChecks(supabase, householdId),
  ]);

  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  return { ingredients, recipes, pantry, plan, checked, recipeById, ingredientById };
}
