import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createProposal, listEntries, moveEntry, patchEntry, rangeNutrition } from '@/lib/services/plan'
import { DateSchema, IdSchema, MealSlotSchema } from '@/lib/validation/common'
import type { McpCtx } from '../auth'
import { guarded, hasScope, isFull } from '../guards'

const GetMealPlanInput = z.strictObject({
  from: DateSchema.describe('Primer día del rango, YYYY-MM-DD'),
  to: DateSchema.describe('Último día del rango, inclusive'),
})

// Mismo contrato que PlanBatchSchema (lib/validation/plan.ts), reescrito como
// z.strictObject porque el SDK usa este esquema TAL CUAL para validar la
// llamada: la propiedad "strict" es lo que hace fallar un argumento inventado.
const SetMealPlanInput = z.strictObject({
  add: z
    .array(
      z.strictObject({
        date: DateSchema,
        slot: MealSlotSchema,
        recipeId: IdSchema.optional(),
        customTitle: z.string().min(1).max(120).optional(),
        servings: z.number().int().min(1).max(100),
      }),
    )
    .max(60)
    .default([]),
  remove: z.array(IdSchema).max(60).default([]),
})

const UpdateEntryInput = z.strictObject({
  entryId: IdSchema,
  servings: z.number().int().min(1).max(100).optional(),
  skipped: z.boolean().optional(),
  date: DateSchema.optional(),
  slot: MealSlotSchema.optional(),
})

export function registerPlanTools(server: McpServer, ctx: McpCtx): boolean {
  let any = false

  if (hasScope(ctx, 'plan:read')) {
    any = true
    server.registerTool(
      'get_meal_plan',
      {
        title: 'Plan de comidas',
        description:
          'Comidas planificadas de un rango de fechas, con la nutrición agregada que calcula el servidor. Úsala para saber qué hay planificado antes de proponer cambios. No la uses para buscar recetas (search_recipes) ni para ver la despensa (get_pantry).',
        inputSchema: GetMealPlanInput,
      },
      guarded('No se pudo leer el plan.', async ({ from, to }: z.infer<typeof GetMealPlanInput>) => {
        const [entries, nutrition] = await Promise.all([listEntries(ctx, { from, to }), rangeNutrition(ctx, { from, to })])
        return { entries, nutrition }
      }),
    )
  }

  if (hasScope(ctx, 'plan:write')) {
    any = true
    server.registerTool(
      'set_meal_plan',
      {
        title: 'Proponer cambios en el plan',
        description:
          'Crea una PROPUESTA de altas y bajas del plan, en un solo lote. NO escribe el plan: la persona la aprueba o la descarta en la app. Dile siempre al usuario que ha quedado pendiente de su aprobación. No la uses para marcar algo como cocinado (log_cooked).',
        inputSchema: SetMealPlanInput,
      },
      guarded('No se pudo crear la propuesta.', async (input: z.infer<typeof SetMealPlanInput>) => {
        const view = await createProposal(ctx, { source: 'mcp', payload: input })
        return { proposalId: view.id, status: view.status, diff: view.diff }
      }),
    )
  }

  if (isFull(ctx) && hasScope(ctx, 'plan:write')) {
    any = true
    server.registerTool(
      'update_meal_plan_entry',
      {
        title: 'Editar una comida del plan',
        description:
          'Cambia las raciones, marca como saltada o mueve de día y hueco UNA entrada ya existente. Solo perfil completo. No la uses para añadir comidas nuevas: eso es set_meal_plan, que pasa por aprobación.',
        inputSchema: UpdateEntryInput,
      },
      guarded('No se pudo editar la entrada.', async ({ entryId, servings, skipped, date, slot }: z.infer<typeof UpdateEntryInput>) => {
        if (date !== undefined && slot !== undefined) return moveEntry(ctx, { entryId, date, slot, sortOrder: 0 })
        const patch = { ...(servings !== undefined ? { servings } : {}), ...(skipped !== undefined ? { skipped } : {}) }
        return patchEntry(ctx, entryId, patch)
      }),
    )
  }

  return any
}
