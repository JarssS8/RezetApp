import { requireApiToken } from '@/lib/auth/guards'
import { listEntries, rangeNutrition } from '@/lib/services/plan'
import { DateRangeSchema } from '@/lib/validation/common'
import { apiError, apiFailure } from '../_lib/respond'

// El plan de un rango: entradas y nutrición agregada por lib/domain (nunca se
// suma aquí, ver regla 2 de AGENTS.md).
export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:read'])
    const sp = new URL(request.url).searchParams
    const parsed = DateRangeSchema.safeParse({ from: sp.get('from'), to: sp.get('to') })
    if (!parsed.success) return apiError('validation', parsed.error.issues[0]?.message ?? 'Rango inválido', 400)
    const [entries, nutrition] = await Promise.all([listEntries(ctx, parsed.data), rangeNutrition(ctx, parsed.data)])
    return Response.json({ entries, nutrition })
  } catch (e) {
    return apiFailure(e)
  }
}
