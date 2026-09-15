import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { SENSITIVE_RE } from '../../../app/src/domain/recipeText';
import type { Difficulty, Ingredient, Recipe, Unit } from '../../../app/src/types';
import type { Ctx } from '../context.js';
import { withErrors } from '../errors.js';
import { mapRecipe, RECIPE_SELECT, type RecipeRow } from '../mappers.js';
import { loadIngredients, loadRecipes } from '../queries.js';
import { recipeFields, uuid } from '../schemas.js';

export interface RecipeInput {
  title: string;
  description: string;
  baseServings: number;
  minutes: number;
  kcalPerServing: number;
  difficulty: Difficulty;
  tags: string[];
  ingredients: { name: string; quantity?: number; unit?: Unit; toTaste?: boolean }[];
  steps: { text: string; timerMinutes?: number }[];
}

/** Byte-for-byte the payload app/src/data/supabaseStore.tsx's saveRecipeMut sends to rpc/save_recipe. */
export function buildSaveRecipePayload(input: RecipeInput, id: string | null) {
  return {
    id,
    name: input.title,
    description: input.description,
    base_servings: input.baseServings,
    minutes: input.minutes,
    difficulty: input.difficulty,
    kcal_per_serving: input.kcalPerServing,
    tags: input.tags,
    ingredients: input.ingredients.map((ri) => ({
      name: ri.name.trim(),
      quantity: ri.toTaste ? null : ri.quantity,
      unit: ri.toTaste ? null : ri.unit,
      to_taste: ri.toTaste ?? false,
      sensitive: SENSITIVE_RE.test(ri.name),
    })),
    steps: input.steps.map((s) => ({
      text: s.text.trim(),
      timer_minutes: s.timerMinutes ?? null,
    })),
    photo_path: null,
  };
}

function summarizeRecipe(r: Recipe, locale: 'es' | 'en') {
  return {
    id: r.id,
    name: r.name[locale] || r.name.es,
    description: r.description[locale] || r.description.es,
    baseServings: r.baseServings,
    minutes: r.minutes,
    difficulty: r.difficulty,
    kcalPerServing: r.kcalPerServing,
    tags: r.tags,
    cookedCount: r.cookedCount,
    ingredientCount: r.ingredients.length,
    hasPhoto: Boolean(r.photoUrl),
  };
}

function detailRecipe(r: Recipe, ingredientById: Map<string, Ingredient>, locale: 'es' | 'en') {
  return {
    id: r.id,
    name: r.name[locale] || r.name.es,
    description: r.description[locale] || r.description.es,
    baseServings: r.baseServings,
    minutes: r.minutes,
    difficulty: r.difficulty,
    kcalPerServing: r.kcalPerServing,
    tags: r.tags,
    cookedCount: r.cookedCount,
    ingredients: r.ingredients.map((ri) => {
      const ing = ingredientById.get(ri.ingredientId);
      return {
        ingredientId: ri.ingredientId,
        name: ing ? ing.name[locale] || ing.name.es : ri.ingredientId,
        quantity: ri.quantity,
        unit: ri.unit,
        toTaste: ri.toTaste ?? false,
        sensitive: ing?.sensitive ?? false,
      };
    }),
    steps: r.steps.map((s, position) => ({
      position,
      text: s.text[locale] || s.text.es,
      ...(s.timerMinutes ? { timerMinutes: s.timerMinutes } : {}),
    })),
  };
}

async function fetchRecipeDetail(ctx: Ctx, recipeId: string) {
  const { data, error } = await ctx.supabase
    .from('recipe')
    .select(RECIPE_SELECT)
    .eq('household_id', ctx.householdId)
    .eq('id', recipeId)
    .single();
  if (error) throw error;
  const recipe = mapRecipe(data as unknown as RecipeRow, ctx.supabase);
  const ingredients = await loadIngredients(ctx.supabase, ctx.householdId);
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  return detailRecipe(recipe, ingredientById, ctx.locale);
}

export function register(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'list_recipes',
    {
      title: 'List recipes',
      description: 'List the household recipes, optionally filtered by a text query matched against the name or an exact tag.',
      inputSchema: {
        query: z.string().trim().min(1).optional().describe('Case-insensitive substring match on the recipe name'),
        tag: z.string().trim().min(1).optional().describe('Exact tag match'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    withErrors(async ({ query, tag }) => {
      const recipes = await loadRecipes(ctx.supabase, ctx.householdId);
      const filtered = recipes.filter((r) => {
        if (query) {
          const name = (r.name[ctx.locale] || r.name.es).toLowerCase();
          if (!name.includes(query.toLowerCase())) return false;
        }
        if (tag && !r.tags.includes(tag)) return false;
        return true;
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(filtered.map((r) => summarizeRecipe(r, ctx.locale)), null, 2) }],
      };
    }),
  );

  server.registerTool(
    'get_recipe',
    {
      title: 'Get recipe',
      description: 'Get full detail for one recipe: resolved ingredient names/quantities/units and ordered steps.',
      inputSchema: { recipeId: uuid },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    withErrors(async ({ recipeId }) => {
      const detail = await fetchRecipeDetail(ctx, recipeId);
      return { content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }] };
    }),
  );

  server.registerTool(
    'create_recipe',
    {
      title: 'Create recipe',
      description:
        'Create a new recipe with ingredients and steps. Ingredients are resolved by name case-insensitively against the household catalogue and created if missing.',
      inputSchema: recipeFields,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withErrors(async (input) => {
      const payload = buildSaveRecipePayload(input, null);
      const { data, error } = await ctx.supabase.rpc('save_recipe', { payload });
      if (error) throw error;
      const recipeId = data as string;
      const detail = await fetchRecipeDetail(ctx, recipeId);
      return { content: [{ type: 'text', text: JSON.stringify({ recipeId, recipe: detail }, null, 2) }] };
    }),
  );
}
