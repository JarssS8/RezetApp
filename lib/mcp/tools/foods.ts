import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createFood, mergeFoods } from '@/lib/services/foods'
import { BaseUnitSchema, IdSchema } from '@/lib/validation/common'
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

const MergeFoodsInput = z.strictObject({
  fromId: IdSchema.describe('Identificador del alimento DUPLICADO, el que desaparece del catálogo'),
  intoId: IdSchema.describe('Identificador del alimento que se queda y recibe todo lo del duplicado'),
})

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
  server.registerTool(
    'merge_foods',
    {
      title: 'Fusionar dos alimentos duplicados',
      description:
        'Fusiona un alimento duplicado del hogar en otro: las recetas y la despensa que usaban el primero pasan a usar el segundo, y el primero deja de aparecer en las búsquedas. Solo perfil completo. Úsala cuando el usuario confirme que dos alimentos son el mismo. No la uses para corregir un nombre (eso es una corrección del alimento), ni para alimentos que solo se parecen, ni sobre alimentos globales del catálogo: no inventes ids, léelos antes de search_foods o de la despensa.',
      inputSchema: MergeFoodsInput,
    },
    guarded('No se pudieron fusionar los alimentos.', async (input: z.infer<typeof MergeFoodsInput>) => mergeFoods(ctx, input.fromId, input.intoId)),
  )
  return true
}
