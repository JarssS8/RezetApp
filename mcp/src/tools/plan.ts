import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { dateKey, todayKey, weekDays } from '../../../app/src/domain/dates';
import { dayKcal, entriesOfDay } from '../../../app/src/domain/shopping';
import type { Ctx } from '../context.js';
import { withErrors } from '../errors.js';
import { mapPlanEntry } from '../mappers.js';
import { loadRecipes } from '../queries.js';
import { isoDate, SLOTS, uuid, weekOffset } from '../schemas.js';

export function register(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'get_week_plan',
    {
      title: 'Get week plan',
      description:
        'Get the 7-day meal plan for a given week, with concrete dates, per-day HOUSEHOLD-planned kcal totals ' +
        '(the whole cooked dish across everyone, not what any one person actually ate — use rezet_my_day for ' +
        'that) and cooked status.',
      inputSchema: { weekOffset },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    withErrors(async ({ weekOffset: offset }) => {
      const dates = weekDays(offset).map(dateKey);
      const monday = dates[0]!;
      const sunday = dates[6]!;

      const { data, error } = await ctx.supabase
        .from('plan_entry')
        .select('id, on_date, slot, recipe_id, servings, cooked_at, cook_member_id')
        .eq('household_id', ctx.householdId)
        .gte('on_date', monday)
        .lte('on_date', sunday);
      if (error) throw error;
      const plan = (data ?? []).map(mapPlanEntry);

      const recipes = await loadRecipes(ctx.supabase, ctx.householdId);
      const recipeById = new Map(recipes.map((r) => [r.id, r]));
      const weekdayFormatter = new Intl.DateTimeFormat(ctx.locale === 'es' ? 'es-ES' : 'en-US', { weekday: 'long' });

      const days = dates.map((date) => ({
        date,
        weekday: weekdayFormatter.format(new Date(`${date}T12:00:00`)),
        // Fórmula del plato entero (raciones planificadas × kcal/ración): lo correcto para
        // planificar la comida de TODA la casa, no lo que ha comido quien pregunta — de ahí el
        // nombre cualificado. Ver rezet_my_day para el consumo personal.
        householdPlannedKcal: dayKcal(date, plan, recipeById),
        entries: entriesOfDay(date, plan).map((e) => ({
          id: e.id,
          slot: e.slot,
          recipeId: e.recipeId,
          recipeName: recipeById.get(e.recipeId)?.name[ctx.locale] || recipeById.get(e.recipeId)?.name.es || null,
          servings: e.servings,
          cooked: e.cooked,
        })),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ weekOffset: offset, monday, sunday, today: todayKey(), days }, null, 2),
          },
        ],
      };
    }),
  );

  server.registerTool(
    'add_to_plan',
    {
      title: 'Add to plan',
      description: 'Add a recipe to the weekly plan on a given date and meal slot. Servings default to the recipe base servings.',
      inputSchema: {
        recipeId: uuid,
        date: isoDate,
        slot: z.enum(SLOTS),
        servings: z.number().int().min(1).max(24).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withErrors(async ({ recipeId, date, slot, servings }) => {
      const { data: recipeRow, error: recipeError } = await ctx.supabase
        .from('recipe')
        .select('id, name, base_servings')
        .eq('household_id', ctx.householdId)
        .eq('id', recipeId)
        .single();
      if (recipeError) throw recipeError;

      const finalServings = servings ?? (recipeRow.base_servings as number) ?? 2;

      const { data, error } = await ctx.supabase
        .from('plan_entry')
        .insert({
          household_id: ctx.householdId,
          on_date: date,
          slot,
          recipe_id: recipeId,
          servings: finalServings,
        })
        .select('id, on_date, slot, recipe_id, servings, cooked_at, cook_member_id')
        .single();
      if (error) throw error;

      const entry = mapPlanEntry(data);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...entry, recipeName: recipeRow.name as string }, null, 2),
          },
        ],
      };
    }),
  );

  server.registerTool(
    'remove_from_plan',
    {
      title: 'Remove from plan',
      description: 'Remove one entry from the weekly plan.',
      inputSchema: { planEntryId: uuid },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    withErrors(async ({ planEntryId }) => {
      const { data, error } = await ctx.supabase
        .from('plan_entry')
        .delete()
        .eq('id', planEntryId)
        .eq('household_id', ctx.householdId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        return { isError: true, content: [{ type: 'text', text: 'rezet: plan entry not found' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ removed: true, planEntryId }, null, 2) }] };
    }),
  );
}
