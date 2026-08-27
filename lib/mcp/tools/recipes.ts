import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { importRecipe } from '@/lib/services/recipe-import'
import { createRecipe, getRecipe, searchRecipes, softDeleteRecipe, updateRecipe } from '@/lib/services/recipes'
import { DifficultySchema, IdSchema } from '@/lib/validation/common'
import { RecipeImportSchema, RecipeInputSchema, RecipeSearchSchema } from '@/lib/validation/recipes'
import type { McpCtx } from '../auth'
import { guarded, hasScope, isFull, toolError, toolJson } from '../guards'

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

// Mismos campos que RecipeInputSchema, como z.strictObject: el SDK lo pasa tal
// cual a safeParseAsync. RecipeInputSchema se sigue usando para parsear después
// (aplica sus valores por defecto), igual que search_recipes hace con
// RecipeSearchSchema. Los ingredientes van como texto: parsearlos, resolver el
// alimento y calcular la nutrición es trabajo del servidor, no del modelo.
const RecipeBodyInput = z.strictObject({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  servingsBase: z.number().int().min(1).max(100),
  prepMinutes: z.number().int().min(0).nullable().optional(),
  cookMinutes: z.number().int().min(0).nullable().optional(),
  difficulty: DifficultySchema.nullable().optional(),
  sourceUrl: z.url().nullable().optional(),
  imageUrls: z.array(z.string().max(300)).max(10).optional(),
  notes: z.string().max(4000).nullable().optional(),
  yieldGrams: z.number().positive().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  ingredients: z.array(z.strictObject({ rawText: z.string().min(1).max(200), scalesLinearly: z.boolean().optional() })).max(100),
  steps: z.array(z.strictObject({ text: z.string().min(1).max(2000) })).max(100),
})

const ImportRecipeInput = z.strictObject({
  kind: z.enum(['url', 'text']),
  url: z.url().optional(),
  text: z.string().min(10).max(20_000).optional(),
})

// Registra search_recipes y get_recipe con recipes:read; create_recipe e
// import_recipe con recipes:write (crear sí, editar y borrar no en el perfil
// básico: docs/05-MCP.md, "Barandillas de seguridad"); update_recipe y
// delete_recipe solo con recipes:write en perfil completo.
export function registerRecipeTools(server: McpServer, ctx: McpCtx): boolean {
  let registered = false

  if (hasScope(ctx, 'recipes:read')) {
    registered = true
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
  }

  if (hasScope(ctx, 'recipes:write')) {
    registered = true
    server.registerTool(
      'create_recipe',
      {
        title: 'Crear una receta',
        description:
          'Crea una receta nueva en el recetario del hogar. Manda cada ingrediente como texto en rawText ("300 g de cebolla"): el servidor lo parsea, lo resuelve contra el catálogo de alimentos y calcula la nutrición. Disponible en cualquier perfil. No la uses para modificar una receta que ya existe.',
        inputSchema: RecipeBodyInput,
      },
      guarded('No se pudo crear la receta.', async (args: z.infer<typeof RecipeBodyInput>) => {
        const detail = await createRecipe(ctx, RecipeInputSchema.parse(args))
        return { id: detail.recipe.id, title: detail.recipe.title, nutrition: detail.nutrition }
      }),
    )

    server.registerTool(
      'import_recipe',
      {
        title: 'Importar una receta',
        description:
          'Importa una receta desde una URL o desde texto pegado y devuelve un BORRADOR sin guardarlo. No guarda nada: revisa el borrador y llama a create_recipe. Enséñaselo al usuario y llama a create_recipe solo si lo aprueba. No la uses si ya tienes la receta estructurada.',
        inputSchema: ImportRecipeInput,
      },
      guarded('No se pudo importar la receta.', async (args: z.infer<typeof ImportRecipeInput>) => importRecipe(ctx, RecipeImportSchema.parse(args))),
    )
  }

  if (isFull(ctx) && hasScope(ctx, 'recipes:write')) {
    registered = true
    server.registerTool(
      'update_recipe',
      {
        title: 'Reemplazar una receta',
        description:
          'Reemplaza por completo una receta existente. Solo perfil completo. Pide confirmación antes: sobrescribe la receta entera, no parchea campos sueltos. Lee la receta con get_recipe primero para no perder nada.',
        inputSchema: z.strictObject({ id: IdSchema, recipe: RecipeBodyInput }),
      },
      guarded('No se pudo actualizar la receta.', async ({ id, recipe }: { id: string; recipe: z.infer<typeof RecipeBodyInput> }) => {
        const detail = await updateRecipe(ctx, id, RecipeInputSchema.parse(recipe))
        return { id: detail.recipe.id }
      }),
    )

    server.registerTool(
      'delete_recipe',
      {
        title: 'Borrar una receta',
        description:
          'Borra una receta del recetario (borrado suave: queda recuperable en la base de datos). Solo perfil completo. Pide confirmación antes.',
        inputSchema: z.strictObject({ id: IdSchema }),
      },
      guarded('No se pudo borrar la receta.', async ({ id }: { id: string }) => {
        await softDeleteRecipe(ctx, id)
        return { deleted: id }
      }),
    )
  }

  return registered
}
