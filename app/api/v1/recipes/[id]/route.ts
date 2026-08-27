import { requireApiToken } from '@/lib/auth/guards'
import { getRecipe, softDeleteRecipe, updateRecipe } from '@/lib/services/recipes'
import { RecipeGetQuerySchema, RecipeInputSchema } from '@/lib/validation/recipes'
import { apiError, apiFailure, parseBody, requireId } from '../../_lib/respond'

type RouteCtx = { params: Promise<{ id: string }> }

async function idOf(routeCtx: RouteCtx): Promise<string> {
  const { id } = await routeCtx.params
  return requireId(id, 'Receta no encontrada')
}

export async function GET(request: Request, routeCtx: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:read'])
    const id = await idOf(routeCtx)
    const q = RecipeGetQuerySchema.safeParse({ servings: new URL(request.url).searchParams.get('servings') ?? undefined })
    if (!q.success) return apiError('validation', 'Raciones inválidas', 400)
    const detail = await getRecipe(ctx, id, q.data.servings !== undefined ? { servings: q.data.servings } : {})
    if (!detail) return apiError('not_found', 'Receta no encontrada', 404)
    return Response.json(detail)
  } catch (e) {
    return apiFailure(e)
  }
}

export async function PUT(request: Request, routeCtx: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:write'])
    const id = await idOf(routeCtx)
    const body = await parseBody(request, RecipeInputSchema)
    if (!body.ok) return body.response
    const detail = await updateRecipe(ctx, id, body.data)
    return Response.json({ id: detail.recipe.id })
  } catch (e) {
    return apiFailure(e)
  }
}

export async function DELETE(request: Request, routeCtx: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:write'])
    await softDeleteRecipe(ctx, await idOf(routeCtx))
    return new Response(null, { status: 204 })
  } catch (e) {
    return apiFailure(e)
  }
}
