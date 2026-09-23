import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { todayKey } from '../../../app/src/domain/dates';
import { intakeOfDay, type IntakeExtraLine } from '../../../app/src/domain/intake';
import type { Ctx } from '../context.js';
import { withErrors } from '../errors.js';
import { mapPlanEntry } from '../mappers.js';
import { loadMyMember, loadRecipes } from '../queries.js';

/**
 * Diseño §12 — las dos herramientas que tienen sentido por voz para la nutrición personal:
 * "cuánto llevo hoy" y "apunta esto que he comido". Reusan `domain/intake.ts`, la MISMA
 * aritmética que ya usan las cuatro pantallas de la app (Hoy, Cook, Plan, Pantry comparten
 * `scaleQuantity`/`isCovered`; esto es lo mismo para "cuánto ha comido cada uno") — si el MCP
 * reimplementara la suma, el asistente y el anillo de Hoy acabarían dando números distintos,
 * justo el fallo que el punto 1 de este cambio corrige en `get_week_plan`.
 */
export function register(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'rezet_my_day',
    {
      title: 'My day',
      description:
        'How much YOU (the connected person, resolved via your own household member record) have eaten ' +
        'today against YOUR personal kcal target: what you have consumed, your target, what is left, and the ' +
        "breakdown — today's cooked plan meals at YOUR OWN serving share (½/1/1½/2, or 0 if you skipped it), " +
        'plus your own logged extras. This is per-person; see get_week_plan for the household-wide planning total.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    withErrors(async () => {
      // "Hoy" es el día de Madrid, no el de UTC del Worker: `todayKey()` ya lee el reloj que
      // `installClock`/`setClock` instalan (worker/clock.ts) — nunca `new Date()` a pelo aquí.
      const today = todayKey();
      const member = await loadMyMember(ctx.supabase, ctx.householdId, ctx.userId);

      // Comidas del plan de HOY, de toda la casa (no filtradas por miembro: el plan es del
      // hogar; la ración de cada uno es lo que aporta `intake_share`/el valor por defecto).
      const { data: planRows, error: planError } = await ctx.supabase
        .from('plan_entry')
        .select('id, on_date, slot, recipe_id, servings, cooked_at, cook_member_id')
        .eq('household_id', ctx.householdId)
        .eq('on_date', today);
      if (planError) throw planError;
      const entries = (planRows ?? []).map(mapPlanEntry);

      const recipes = await loadRecipes(ctx.supabase, ctx.householdId);
      const recipeById = new Map(recipes.map((r) => [r.id, r]));

      // Las EXCEPCIONES de este miembro a "una ración por persona" (§6.2 del diseño). La RLS
      // (`can_act_for`) ya acota esto a lo propio; el filtro explícito es solo para no traer
      // filas de nadie más y quedarnos con el mapa que pide `intakeOfDay`.
      const { data: shareRows, error: shareError } = await ctx.supabase
        .from('intake_share')
        .select('plan_entry_id, servings')
        .eq('member_id', member.id);
      if (shareError) throw shareError;
      const shares = new Map<string, number>(
        (shareRows ?? []).map((r) => [r.plan_entry_id as string, Number(r.servings)]),
      );

      const { data: extraRows, error: extraError } = await ctx.supabase
        .from('intake_extra')
        .select('id, label, kcal')
        .eq('member_id', member.id)
        .eq('date', today);
      if (extraError) throw extraError;
      const extras: IntakeExtraLine[] = (extraRows ?? []).map((r) => ({
        id: r.id as string,
        label: r.label as string,
        kcal: r.kcal as number,
      }));

      const day = intakeOfDay({ entries, recipeById, shares, extras });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                date: today,
                kcalTarget: member.kcalTarget,
                kcalDone: day.done,
                kcalRemaining: member.kcalTarget - day.done,
                meals: day.meals.map((m) => ({
                  planEntryId: m.planEntryId,
                  recipeId: m.recipeId,
                  recipeName:
                    recipeById.get(m.recipeId)?.name[ctx.locale] || recipeById.get(m.recipeId)?.name.es || null,
                  slot: m.slot,
                  cooked: m.cooked,
                  share: m.share,
                  kcal: m.kcal,
                })),
                extras: day.extraLines,
              },
              null,
              2,
            ),
          },
        ],
      };
    }),
  );

  server.registerTool(
    'rezet_log_intake',
    {
      title: 'Log intake',
      description:
        'Log something YOU (the connected person) just ate outside the weekly plan: a name and its kcal. Voice ' +
        'equivalent of the "Rápido" (quick) tab in the app\'s "Añadir" sheet. Always logged for today, attributed ' +
        'to your own household member.',
      inputSchema: {
        label: z.string().trim().min(1).describe('What was eaten, in the household\'s own words (e.g. "un yogur")'),
        kcal: z.number().int().min(0).max(10000),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withErrors(async ({ label, kcal }) => {
      const today = todayKey();
      const member = await loadMyMember(ctx.supabase, ctx.householdId, ctx.userId);

      // `member_id` (de quién es) y `created_by` (quién lo registró) son el mismo miembro
      // aquí: esta herramienta solo registra para uno mismo, no para un tutelado. El trigger
      // `check_intake_extra_refs` valida igualmente que ambos cuadren con `household_id`.
      const { data, error } = await ctx.supabase
        .from('intake_extra')
        .insert({
          household_id: ctx.householdId,
          member_id: member.id,
          date: today,
          label,
          kcal,
          source: 'manual',
          recipe_id: null,
          created_by: member.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ id: data.id as string, date: today, label, kcal }, null, 2),
          },
        ],
      };
    }),
  );
}
