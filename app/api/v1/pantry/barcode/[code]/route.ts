import { requireApiToken } from '@/lib/auth/guards'
import { lookupBarcode } from '@/lib/services/foods'
import { BarcodeSchema } from '@/lib/validation/foods'
import { apiError, apiFailure } from '../../../_lib/respond'

// Sale a Open Food Facts si el código no está en el catálogo local, y cachea
// el resultado creando el alimento en el hogar (lib/services/foods.ts §9.4c).
export async function GET(request: Request, routeCtx: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['pantry:read'])
    const { code } = await routeCtx.params
    const parsed = BarcodeSchema.safeParse(code)
    if (!parsed.success) return apiError('validation', 'Código de barras inválido', 400)
    const food = await lookupBarcode(ctx, parsed.data)
    if (!food) return apiError('not_found', 'Ese código no está en ningún catálogo', 404)
    return Response.json(food)
  } catch (e) {
    return apiFailure(e)
  }
}
