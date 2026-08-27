import { requireApiToken } from '@/lib/auth/guards'
import { createRecipe, searchRecipes } from '@/lib/services/recipes'
import { ServiceError } from '@/lib/services/ctx'
import { RecipeInputSchema, RecipeSearchSchema } from '@/lib/validation/recipes'
import { apiFailure, parseBody } from '../_lib/respond'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:read'])
    const sp = new URL(request.url).searchParams
    const parsed = RecipeSearchSchema.safeParse({
      q: sp.get('q') ?? undefined,
      tags: sp.getAll('tags').length > 0 ? sp.getAll('tags') : undefined,
      maxMinutes: sp.get('maxMinutes') ?? undefined,
      difficulty: sp.get('difficulty') ?? undefined,
      // Igual que app/(app)/recipes/page.tsx: una única lista separada por comas, no valores repetidos.
      hasIngredients: sp.get('hasIngredients') ? sp.get('hasIngredients')!.split(',') : undefined,
      onlyWithPantry: sp.get('onlyWithPantry') ?? undefined,
      sort: sp.get('sort') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      offset: sp.get('offset') ?? undefined,
    })
    if (!parsed.success) return apiFailure(new ServiceError('validation', parsed.error.issues[0]?.message ?? 'Consulta inválida'))
    return Response.json(await searchRecipes(ctx, parsed.data))
  } catch (e) {
    return apiFailure(e)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:write'])
    const body = await parseBody(request, RecipeInputSchema)
    if (!body.ok) return body.response
    const detail = await createRecipe(ctx, body.data)
    return Response.json({ id: detail.recipe.id }, { status: 201 })
  } catch (e) {
    return apiFailure(e)
  }
}
