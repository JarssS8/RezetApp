import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getRecipe, searchRecipes } from '@/lib/services/recipes'
import { DifficultySchema, IdSchema } from '@/lib/validation/common'
import { RecipeSearchSchema } from '@/lib/validation/recipes'
import type { McpCtx } from '../auth'
import { guarded, hasScope, toolError, toolJson } from '../guards'

// Mismos campos que RecipeSearchSchema (lib/validation/recipes.ts), pero como
// z.strictObject: el SDK MCP usa este esquema tal cual para validar la
// llamada (server.registerTool lo pasa directo a safeParseAsync sin
// envolverlo), así que la propiedad "strict" de zod es lo que hace que un
// argumento inesperado del modelo falle en vez de colarse silenciosamente.
// RecipeSearchSchema en sí no sirve de inputSchema porque extiende
// PaginationSchema (z.object, no estricto): se reutiliza más abajo solo para
// aplicar sus valores por defecto (limit/offset/sort) antes de llamar al
// servicio.
const SearchRecipesInputSchema = z.strictObject({
  q: z.string().max(120).optional(),
  tags: z.array(z.string()).max(20).optional(),
  maxMinutes: z.number().int().min(0).optional(),
  difficulty: DifficultySchema.optional(),
  hasIngredients: z.array(IdSchema).max(20).optional(),
  onlyWithPantry: z.boolean().optional(),
  sort: z.enum(['relevance', 'recent', 'most_cooked', 'title']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

const GetRecipeInputSchema = z.strictObject({
  id: IdSchema,
  servings: z.number().int().min(1).max(100).optional(),
})

// Registra search_recipes y get_recipe solo si el token trae recipes:read. El
// perfil "full" no añade nada aquí en W2 (ver comentario de registerHouseholdTools).
export function registerRecipeTools(server: McpServer, ctx: McpCtx): boolean {
  if (!hasScope(ctx, 'recipes:read')) return false

  server.registerTool(
    'search_recipes',
    {
      title: 'Buscar recetas',
      description:
        'Busca recetas del hogar por texto, etiquetas, tiempo máximo o alimentos. Devuelve resúmenes con id. No la uses para leer una receta completa: usa get_recipe.',
      inputSchema: SearchRecipesInputSchema,
    },
    guarded('No se pudo buscar recetas.', async (args: z.infer<typeof SearchRecipesInputSchema>) => {
      const input = RecipeSearchSchema.parse(args)
      return searchRecipes(ctx, input)
    }),
  )

  server.registerTool(
    'get_recipe',
    {
      title: 'Receta completa',
      description:
        'Receta completa por id, opcionalmente escalada a N raciones (el escalado lo hace el servidor). No inventes cantidades: usa las devueltas.',
      inputSchema: GetRecipeInputSchema,
    },
    // No usa guarded: "no encontrada" es un resultado esperado con su propio
    // mensaje, no una excepción del servicio que haya que enmascarar.
    async ({ id, servings }: z.infer<typeof GetRecipeInputSchema>) => {
      try {
        const detail = await getRecipe(ctx, id, servings !== undefined ? { servings } : {})
        if (!detail) return toolError('Receta no encontrada.')
        return toolJson(detail)
      } catch (e) {
        console.error('[mcp]', e)
        return toolError('No se pudo leer la receta.')
      }
    },
  )
  return true
}
