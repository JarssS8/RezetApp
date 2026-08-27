import { requireApiToken } from '@/lib/auth/guards'
import { pushShopping, ShopListError } from '@/lib/services/shopping'
import { ShoppingPushSchema } from '@/lib/validation/shopping'
import { apiError, apiFailure, parseBody } from '../../_lib/respond'

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['shopping:push'])
    const body = await parseBody(request, ShoppingPushSchema)
    if (!body.ok) return body.response
    return Response.json(await pushShopping(ctx, body.data.lines))
  } catch (e) {
    // El mensaje de ShopListError trae el estado HTTP del otro extremo, nunca
    // el secreto: se pasa tal cual bajo el código 'shoplist' (mismo contrato
    // que lib/actions/shopping.ts). 502: el fallo es del servicio de enfrente.
    if (e instanceof ShopListError) return apiError('shoplist', e.message, 502)
    return apiFailure(e)
  }
}
