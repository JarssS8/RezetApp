import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { logCooked } from '@/lib/services/cooking'
import { ServiceError } from '@/lib/services/ctx'
import { DateSchema, IdSchema, MealSlotSchema } from '@/lib/validation/common'
import { LogCookedSchema } from '@/lib/validation/cooking'
import type { McpCtx } from '../auth'
import { hasScope, toolError, toolJson } from '../guards'

// Misma forma que LogCookedSchema (lib/validation/cooking.ts) pero como
// z.strictObject sin .refine: el SDK pasa el inputSchema tal cual a
// safeParseAsync y un ZodEffects (lo que devuelve .refine) no le sirve de
// inputSchema. La regla "entryId o recipeId" (y "slot solo sin entryId") se
// comprueba en el handler, que vuelve a validar con LogCookedSchema antes de
// llamar al servicio.
const LogCookedInput = z.strictObject({
  entryId: IdSchema.optional().describe('Entrada del plan que se ha cocinado. Si no la sabes, usa recipeId.'),
  recipeId: IdSchema.optional().describe('Receta cocinada sin hueco en el plan: se creará la entrada de hoy.'),
  servingsCooked: z.number().int().min(1).max(100).describe('Raciones que se han hecho de verdad'),
  slot: MealSlotSchema.optional().describe('Hueco de la entrada nueva; por defecto, el que toque por la hora. Solo válido junto a recipeId.'),
  leftovers: z
    .strictObject({ servings: z.number().int().min(1).max(100), date: DateSchema, slot: MealSlotSchema })
    .optional()
    .describe('Sobras a planificar; por defecto no se crea ninguna'),
})

export function registerCookingTools(server: McpServer, ctx: McpCtx): boolean {
  // §6 del spec: cooking:write es lo único que hace falta; el scope ya implica
  // tocar plan y despensa. No exige plan:write ni pantry:write.
  if (!hasScope(ctx, 'cooking:write')) return false
  server.registerTool(
    'log_cooked',
    {
      title: 'Registrar una comida cocinada',
      description:
        'Marca una comida como cocinada: descuenta los ingredientes de la despensa, registra la nutrición y, si se piden, planifica las sobras. Todo a la vez y de forma atómica. Devuelve avisos de lo que faltaba en la despensa. Úsala cuando la persona diga que ya ha cocinado algo. No la uses para planificar (set_meal_plan) ni para ajustar existencias a mano (update_pantry).',
      inputSchema: LogCookedInput,
    },
    async (input: z.infer<typeof LogCookedInput>) => {
      // El inputSchema del SDK ya validó la forma; falta la parte que un
      // z.strictObject sin refine no puede expresar (entryId XOR recipeId,
      // slot solo con recipeId). Se revalida aquí contra el esquema real antes
      // de tocar el servicio.
      const parsed = LogCookedSchema.safeParse(input)
      if (!parsed.success) return toolError(parsed.error.issues[0]?.message ?? 'Argumentos inválidos.')
      // LogCookedSchema (lib/validation/cooking.ts, congelado) solo exige "al
      // menos uno de los dos"; mandar ambos a la vez es ambiguo (¿se cocina la
      // entrada del plan o la receta suelta?) y aquí se rechaza explícitamente
      // antes de tocar el servicio.
      if (parsed.data.entryId && parsed.data.recipeId) return toolError('envía entryId o recipeId, no los dos')
      try {
        const result = await logCooked(ctx, parsed.data)
        return toolJson({
          entryId: result.entryId,
          cookingLogId: result.logId,
          deductions: result.deductions,
          warnings: result.warnings,
          leftoverEntryId: result.leftoverEntryId,
        })
      } catch (e) {
        // Doble cocinado (misma entrada dos veces): nunca un segundo descuento
        // de despensa, solo un error claro que remita al historial (barandilla
        // de idempotencia de §9.5). El resto de fallos queda tras un mensaje
        // genérico, igual que el resto de herramientas (ver guards.ts::guarded).
        if (e instanceof ServiceError && e.code === 'conflict') return toolError('Esa comida ya está cocinada; consulta el historial')
        console.error('[mcp]', e)
        return toolError('No se pudo registrar el cocinado.')
      }
    },
  )
  return true
}
