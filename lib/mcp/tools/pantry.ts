import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { adjustPantryItem, listPantry, removePantryItem, upsertPantryItem } from '@/lib/services/pantry'
import { BaseUnitSchema, DateSchema, IdSchema } from '@/lib/validation/common'
import type { McpCtx } from '../auth'
import { guarded, hasScope, isFull } from '../guards'

const GetPantryInput = z.strictObject({
  location: z.enum(['fridge', 'freezer', 'pantry']).optional().describe('Filtra por dónde está guardado'),
  q: z.string().max(80).optional().describe('Texto para buscar por nombre de alimento'),
  expiresBefore: DateSchema.optional().describe('Solo lo que caduca antes de esta fecha. Este filtro es la mejor forma de proponer qué cocinar.'),
})

// No se reutiliza PantryItemInputSchema ni PantryAdjustSchema tal cual (no son
// z.strictObject: el SDK usa este esquema directamente para validar la
// llamada, y "strict" es lo que hace fallar un argumento inventado). El
// refine repite el contrato de "una cosa u otra, nunca las dos": ajustar un
// artículo existente (itemId + delta) o crear uno nuevo (foodId + quantity +
// unit), igual que set_meal_plan repite el suyo (revisión ae9002d).
const UpdatePantryInput = z
  .strictObject({
    itemId: IdSchema.optional().describe('Artículo existente a ajustar'),
    delta: z.number().optional().describe('Cuánto sumar (positivo) o restar (negativo), en unidad base'),
    foodId: IdSchema.optional().describe('Alimento del artículo nuevo, si no existe todavía'),
    quantity: z.number().min(0).optional(),
    unit: BaseUnitSchema.optional(),
    location: z.enum(['fridge', 'freezer', 'pantry']).optional(),
    expiresAt: DateSchema.nullable().optional(),
  })
  .refine((v) => (v.itemId !== undefined && v.delta !== undefined) || (v.foodId !== undefined && v.quantity !== undefined && v.unit !== undefined), {
    message: 'Ajusta un artículo existente (itemId + delta) o crea uno nuevo (foodId + quantity + unit)',
  })
  // Un delta de 0 no ajusta nada: sería una llamada sin efecto que además
  // dispara el evento pantry.changed de balde (mismo espíritu que
  // PantryAdjustSchema en lib/validation/pantry.ts, que este esquema no
  // reutiliza por no ser z.strictObject).
  .refine((v) => v.delta === undefined || v.delta !== 0, { message: 'delta no puede ser 0: no habría nada que ajustar' })

export function registerPantryTools(server: McpServer, ctx: McpCtx): boolean {
  let registered = false

  if (hasScope(ctx, 'pantry:read')) {
    registered = true
    server.registerTool(
      'get_pantry',
      {
        title: 'Despensa',
        description:
          'Inventario del hogar, con filtro opcional por ubicación, texto o fecha de caducidad. Úsala antes de proponer comidas para gastar lo que caduca. No la uses para buscar recetas (search_recipes).',
        inputSchema: GetPantryInput,
      },
      guarded('No se pudo leer la despensa.', async (input: z.infer<typeof GetPantryInput>) => {
        const rows = await listPantry(ctx, input)
        // Se aplana cada fila (PantryRow trae además openedAt, addedAt y el
        // alimento completo anidado): el modelo solo necesita lo justo para
        // decidir qué cocinar, sin tener que navegar una forma interna.
        return rows.map((row) => ({
          id: row.id,
          foodId: row.foodId,
          name: row.name,
          quantity: row.quantity,
          unit: row.unit,
          location: row.location,
          expiresAt: row.expiresAt,
          daysToExpiry: row.daysToExpiry,
          kcal100g: row.food.kcal100g,
        }))
      }),
    )
  }

  if (hasScope(ctx, 'pantry:write')) {
    registered = true
    server.registerTool(
      'update_pantry',
      {
        title: 'Ajustar la despensa',
        description:
          'Suma o resta existencias de un artículo (itemId + delta, en unidad base), o crea uno nuevo (foodId + quantity + unit). Trabaja con DELTAS, no con cantidades absolutas: así dos ajustes a la vez no se pisan. No la uses para descontar lo que se ha cocinado: eso lo hace log_cooked solo.',
        inputSchema: UpdatePantryInput,
      },
      guarded('No se pudo ajustar la despensa.', async (input: z.infer<typeof UpdatePantryInput>) => {
        if (input.itemId !== undefined && input.delta !== undefined) return adjustPantryItem(ctx, { itemId: input.itemId, delta: input.delta })
        // El refine del esquema ya garantiza esta otra combinación cuando la
        // primera no se cumple: se repite la comprobación aquí (en vez de
        // "as") para que TypeScript estreche los tipos sin castear a mano.
        if (input.foodId !== undefined && input.quantity !== undefined && input.unit !== undefined) {
          return upsertPantryItem(ctx, {
            foodId: input.foodId,
            quantity: input.quantity,
            unit: input.unit,
            location: input.location ?? 'pantry',
            ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
          })
        }
        throw new Error('Combinación de argumentos inalcanzable: el esquema ya la descarta')
      }),
    )
  }

  if (isFull(ctx) && hasScope(ctx, 'pantry:write')) {
    registered = true
    server.registerTool(
      'delete_pantry_item',
      {
        title: 'Borrar un artículo de despensa',
        description:
          'Elimina del inventario un artículo entero. Solo perfil completo. Para dejarlo a cero sin borrarlo, usa update_pantry con un delta negativo: un artículo a cero conserva su ubicación y su caducidad.',
        inputSchema: z.strictObject({ itemId: IdSchema }),
      },
      guarded('No se pudo borrar el artículo.', async ({ itemId }: { itemId: string }) => {
        await removePantryItem(ctx, itemId)
        return { deleted: itemId }
      }),
    )
  }

  return registered
}
