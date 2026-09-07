import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { slotForNow, todayKey } from '../../../app/src/domain/dates';
import type { Shortage } from '../../../app/src/types';
import type { Ctx } from '../context.js';
import { withErrors } from '../errors.js';
import { loadIngredients, loadPantry } from '../queries.js';
import { uuid } from '../schemas.js';

export function register(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'cook_recipe',
    {
      title: 'Cook recipe',
      description:
        'Register that a recipe was cooked: subtracts the scaled quantities from the pantry, increments the recipe cooked count, and marks/creates the plan entry for today. This subtracts from the pantry; confirm with the user before calling.',
      inputSchema: {
        recipeId: uuid,
        servings: z.number().int().min(1).max(24),
        planEntryId: uuid.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    withErrors(async ({ recipeId, servings, planEntryId }) => {
      const { data, error } = await ctx.supabase.rpc('finish_cook', {
        p_recipe_id: recipeId,
        p_servings: servings,
        p_plan_entry_id: planEntryId ?? null,
        p_today: todayKey(),
        p_slot: slotForNow(),
      });
      if (error) throw error;
      const shortages = (data ?? []) as Shortage[];

      const [pantry, ingredients] = await Promise.all([
        loadPantry(ctx.supabase, ctx.householdId),
        loadIngredients(ctx.supabase, ctx.householdId),
      ]);
      const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
      const pantryView = pantry
        .map((p) => {
          const ing = ingredientById.get(p.ingredientId);
          return {
            id: p.id,
            ingredientId: p.ingredientId,
            name: ing ? ing.name[ctx.locale] || ing.name.es : p.ingredientId,
            group: ing?.group ?? 'seco',
            quantity: p.quantity,
            unit: p.unit,
            location: p.location,
            expiresInDays: p.expiresInDays,
          };
        })
        .sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name));

      return { content: [{ type: 'text', text: JSON.stringify({ shortages, pantry: pantryView }, null, 2) }] };
    }),
  );
}
