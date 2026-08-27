import { requireApiToken } from '@/lib/auth/guards'
import { removePantryItem } from '@/lib/services/pantry'
import { apiFailure, requireId } from '../../_lib/respond'

export async function DELETE(request: Request, routeCtx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['pantry:write'])
    const { id } = await routeCtx.params
    requireId(id, 'Artículo no encontrado')
    await removePantryItem(ctx, id)
    return new Response(null, { status: 204 })
  } catch (e) {
    return apiFailure(e)
  }
}
