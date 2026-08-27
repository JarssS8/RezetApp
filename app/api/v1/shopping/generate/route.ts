import { requireApiToken } from '@/lib/auth/guards'
import { generateShopping } from '@/lib/services/shopping'
import { ShoppingGenerateSchema } from '@/lib/validation/shopping'
import { apiFailure, parseBody } from '../../_lib/respond'

// POST aunque solo lee: el rango va en el cuerpo con el mismo DateRangeSchema
// que usa la interfaz. Consolidar exige ver el plan Y la despensa, así que
// pide los dos scopes de lectura (requireApiToken los exige todos).
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:read', 'pantry:read'])
    const body = await parseBody(request, ShoppingGenerateSchema)
    if (!body.ok) return body.response
    return Response.json(await generateShopping(ctx, body.data))
  } catch (e) {
    return apiFailure(e)
  }
}
