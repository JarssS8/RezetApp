import { requireApiToken } from '@/lib/auth/guards'
import { searchFoods } from '@/lib/services/foods'
import { FoodSearchSchema } from '@/lib/validation/foods'
import { apiError, apiFailure, requireAnyScope } from '../../_lib/respond'

export async function GET(request: Request): Promise<Response> {
  try {
    // El catálogo de alimentos es transversal: lo consulta tanto quien escribe
    // una receta como quien llena la despensa. API_SCOPES (congelado en W1) no
    // tiene un scope propio para él, así que basta con uno de los dos de lectura.
    const ctx = await requireApiToken(request, [])
    requireAnyScope(ctx, ['recipes:read', 'pantry:read'])
    const sp = new URL(request.url).searchParams
    const parsed = FoodSearchSchema.safeParse({ q: sp.get('q') ?? '', locale: sp.get('locale') ?? undefined, limit: sp.get('limit') ?? undefined, offset: sp.get('offset') ?? undefined })
    if (!parsed.success) return apiError('validation', parsed.error.issues[0]?.message ?? 'Consulta inválida', 400)
    return Response.json(await searchFoods(ctx, parsed.data))
  } catch (e) {
    return apiFailure(e)
  }
}
