import { requireApiToken } from '@/lib/auth/guards'
import { listPantry, upsertPantryItem } from '@/lib/services/pantry'
import { IdSchema } from '@/lib/validation/common'
import { PantryItemInputSchema, PantryQuerySchema } from '@/lib/validation/pantry'
import { apiError, apiFailure, parseBody } from '../_lib/respond'

// Reemplazo completo si trae id, alta si no (mismo contrato que
// lib/actions/pantry.ts: el servicio distingue por la presencia de la clave).
const PantryUpsertSchema = PantryItemInputSchema.extend({ id: IdSchema.optional() })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['pantry:read'])
    const sp = new URL(request.url).searchParams
    const parsed = PantryQuerySchema.safeParse({ location: sp.get('location') ?? undefined, q: sp.get('q') ?? undefined, expiresBefore: sp.get('expiresBefore') ?? undefined })
    if (!parsed.success) return apiError('validation', parsed.error.issues[0]?.message ?? 'Consulta inválida', 400)
    return Response.json(await listPantry(ctx, parsed.data))
  } catch (e) {
    return apiFailure(e)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['pantry:write'])
    const body = await parseBody(request, PantryUpsertSchema)
    if (!body.ok) return body.response
    // exactOptionalPropertyTypes: no se propaga `id: undefined`.
    const { id, ...rest } = body.data
    const row = await upsertPantryItem(ctx, id ? { ...rest, id } : rest)
    return Response.json(row, { status: id ? 200 : 201 })
  } catch (e) {
    return apiFailure(e)
  }
}
