import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createFood } from '@/lib/services/foods'
import { BaseUnitSchema } from '@/lib/validation/common'
import { FoodInputSchema } from '@/lib/validation/foods'
import type { McpCtx } from '../auth'
import { guarded, hasScope, isFull } from '../guards'

// Subconjunto estricto de FoodInputSchema: lo que un modelo puede rellenar sin
// inventarse conversiones. gramsPerCup/gramsPerTbsp/densityGPerMl quedan fuera
// a propósito: una densidad inventada estropea el escalado de toda receta que
// use el alimento. Se corrigen a mano desde la app.
const CreateFoodInput = z.strictObject({
  nameEs: z.string().min(1).max(120).describe('Nombre en español'),
  nameEn: z.string().min(1).max(120).describe('Nombre en inglés'),
  defaultUnit: BaseUnitSchema.optional().describe("Unidad habitual: 'g', 'ml' o 'ud'"),
  kcal100g: z.number().min(0).nullable().optional().describe('kcal por 100 g'),
  protein100g: z.number().min(0).nullable().optional().describe('Proteína en gramos por 100 g'),
  carbs100g: z.number().min(0).nullable().optional().describe('Hidratos en gramos por 100 g'),
  fat100g: z.number().min(0).nullable().optional().describe('Grasa en gramos por 100 g'),
  fiber100g: z.number().min(0).nullable().optional().describe('Fibra en gramos por 100 g'),
  gramsPerUnit: z.number().positive().nullable().optional().describe('Gramos que pesa una pieza, si el alimento se cuenta por piezas'),
})

// merge_foods (perfil completo en spec §12) NO se registra en W3: el servicio
// de fusión llega en W4(d) junto con las etiquetas jerárquicas. Registrarla
// vacía sería peor que no tenerla: un modelo pequeño la intentaría igual.
export function registerFoodTools(server: McpServer, ctx: McpCtx): boolean {
  if (!isFull(ctx) || !hasScope(ctx, 'recipes:write')) return false
  server.registerTool(
    'create_food',
    {
      title: 'Crear un alimento',
      description:
        'Añade un alimento al catálogo del hogar con su nutrición por 100 g. Solo perfil completo. Úsala únicamente cuando search_recipes o la despensa no encuentren un alimento que hace falta. No la uses para corregir uno existente.',
      inputSchema: CreateFoodInput,
    },
    // FoodInputSchema.parse rellena aliases/allergens/seasonalMonths ([]),
    // defaultUnit ('g') y deja fuera los campos de conversión que
    // CreateFoodInput no declara: mismo patrón que search_recipes reparsando
    // contra RecipeSearchSchema (lib/mcp/tools/recipes.ts).
    guarded('No se pudo crear el alimento.', async (input: z.infer<typeof CreateFoodInput>) => createFood(ctx, FoodInputSchema.parse(input), 'manual')),
  )
  return true
}
