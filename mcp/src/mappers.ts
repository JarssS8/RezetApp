import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveExpiry } from '../../app/src/domain/dates';
import { SENSITIVE_RE, inferFoodGroup } from '../../app/src/domain/recipeText';
import type {
  FoodGroup,
  Ingredient,
  MealSlot,
  PantryItem,
  PantryLoc,
  PlanEntry,
  Recipe,
  Unit,
} from '../../app/src/types';

/**
 * Copied from app/src/data/supabaseStore.tsx (lines 36-151, 153, 425-452 as read
 * on 2026-09-07). Keep in sync. That file imports React + TanStack Query and
 * closes over a module-level `supabase` client, so it cannot be imported from
 * Node — this is the one deliberate copy in the MCP server (plan §3.2).
 * `mapRecipe` takes the Supabase client explicitly (for the photo public URL)
 * instead of closing over a module-level one.
 */

export function mapIngredient(row: {
  id: string;
  name_es: string;
  name_en: string;
  food_group: FoodGroup;
  default_unit: Unit;
  is_sensitive: boolean;
}): Ingredient {
  return {
    id: row.id,
    name: { es: row.name_es, en: row.name_en },
    group: row.food_group,
    defaultUnit: row.default_unit,
    sensitive: row.is_sensitive,
  };
}

export interface RecipeRow {
  id: string;
  name: string;
  description: string | null;
  base_servings: number;
  minutes: number;
  difficulty: Recipe['difficulty'];
  kcal_per_serving: number;
  cooked_count: number;
  photo_path: string | null;
  source_idea_id: string | null;
  recipe_tag: Array<{ tag: { name: string } }>;
  recipe_ingredient: Array<{
    id: string;
    ingredient_id: string;
    quantity: number | null;
    unit: Unit | null;
    to_taste: boolean;
    position: number;
  }>;
  recipe_step: Array<{
    id: string;
    position: number;
    text: string;
    timer_minutes: number | null;
    recipe_step_ingredient: Array<{ recipe_ingredient_id: string }>;
  }>;
}

export function mapRecipe(row: RecipeRow, supabase: SupabaseClient): Recipe {
  const ingredients = [...row.recipe_ingredient].sort((a, b) => a.position - b.position);
  const riIdToIngredientId = new Map(ingredients.map((ri) => [ri.id, ri.ingredient_id]));
  const steps = [...row.recipe_step].sort((a, b) => a.position - b.position);

  return {
    id: row.id,
    name: { es: row.name, en: row.name },
    description: { es: row.description ?? '', en: row.description ?? '' },
    baseServings: row.base_servings,
    minutes: row.minutes,
    difficulty: row.difficulty,
    kcalPerServing: row.kcal_per_serving,
    tags: row.recipe_tag.map((t) => t.tag.name),
    cookedCount: row.cooked_count,
    ...(row.photo_path
      ? { photoUrl: supabase.storage.from('recipe-photos').getPublicUrl(row.photo_path).data.publicUrl }
      : {}),
    ...(row.source_idea_id ? { sourceIdeaId: row.source_idea_id } : {}),
    ingredients: ingredients.map((ri) => ({
      ingredientId: ri.ingredient_id,
      quantity: ri.quantity == null ? null : Number(ri.quantity),
      unit: ri.unit,
      toTaste: ri.to_taste,
    })),
    steps: steps.map((s) => {
      const ingredientIds = s.recipe_step_ingredient
        .map((x) => riIdToIngredientId.get(x.recipe_ingredient_id))
        .filter((x): x is string => Boolean(x));
      return {
        text: { es: s.text, en: s.text },
        ...(s.timer_minutes ? { timerMinutes: s.timer_minutes } : {}),
        ...(ingredientIds.length ? { ingredientIds } : {}),
      };
    }),
  };
}

export function mapPantryItem(row: {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: Unit;
  location: PantryLoc;
  expires_on: string | null;
}): PantryItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    quantity: Number(row.quantity),
    unit: row.unit,
    location: row.location,
    expiresInDays: resolveExpiry(row.expires_on),
  };
}

export function mapPlanEntry(row: {
  id: string;
  on_date: string;
  slot: MealSlot;
  recipe_id: string;
  servings: number;
  cooked_at: string | null;
}): PlanEntry {
  return {
    id: row.id,
    date: row.on_date,
    slot: row.slot,
    recipeId: row.recipe_id,
    servings: row.servings,
    cooked: row.cooked_at != null,
  };
}

export const RECIPE_SELECT = `
  id, name, description, base_servings, minutes, difficulty, kcal_per_serving, cooked_count, photo_path, source_idea_id,
  recipe_tag ( tag ( name ) ),
  recipe_ingredient ( id, ingredient_id, quantity, unit, to_taste, position ),
  recipe_step ( id, position, text, timer_minutes, recipe_step_ingredient ( recipe_ingredient_id ) )
`;

/** Escapes `%`, `_` and `\` so a literal search term never acts as an ILIKE wildcard (Postgres LIKE/ILIKE default ESCAPE is `\`). */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function resolveIngredientId(
  supabase: SupabaseClient,
  householdId: string,
  name: string,
  unit: Unit,
): Promise<string> {
  const pattern = escapeIlike(name);
  const { data: found } = await supabase
    .from('ingredient')
    .select('id')
    .or(`household_id.eq.${householdId},household_id.is.null`)
    .ilike('name_es', pattern)
    .limit(1)
    .maybeSingle();
  if (found) return found.id as string;

  const { data: created, error } = await supabase
    .from('ingredient')
    .insert({
      household_id: householdId,
      name_es: name,
      name_en: name,
      default_unit: unit,
      food_group: inferFoodGroup(name),
      is_sensitive: SENSITIVE_RE.test(name),
    })
    .select('id')
    .single();
  if (error) {
    // Race: another concurrent call resolved/created this same name first and won the
    // unique constraint. Re-run the SELECT instead of throwing — don't retry everything.
    if (error.code === '23505') {
      const { data: retryFound, error: retryError } = await supabase
        .from('ingredient')
        .select('id')
        .or(`household_id.eq.${householdId},household_id.is.null`)
        .ilike('name_es', pattern)
        .limit(1)
        .maybeSingle();
      if (retryError) throw retryError;
      if (retryFound) return retryFound.id as string;
    }
    throw error;
  }
  return created.id as string;
}
