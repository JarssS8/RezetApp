import { requireApiToken } from '@/lib/auth/guards'
import { importRecipe } from '@/lib/services/recipe-import'
import { RecipeImportSchema } from '@/lib/validation/recipes'
import { apiFailure, parseBody } from '../../_lib/respond'

// Devuelve un BORRADOR: no guarda nada. Quien lo quiera guardar llama después
// a POST /api/v1/recipes con el resultado revisado.
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:write'])
    const body = await parseBody(request, RecipeImportSchema)
    if (!body.ok) return body.response
    return Response.json(await importRecipe(ctx, body.data))
  } catch (e) {
    return apiFailure(e)
  }
}
