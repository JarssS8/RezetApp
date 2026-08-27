import { requireApiToken } from '@/lib/auth/guards'
import { readJson } from '@/lib/auth/http'
import { applyBatch, moveEntry, patchEntry } from '@/lib/services/plan'
import { PlanEntryMoveSchema, PlanEntryPatchSchema } from '@/lib/validation/plan'
import { apiError, apiFailure, requireId } from '../../../_lib/respond'

type RouteCtx = { params: Promise<{ id: string }> }

// Un PATCH con date+slot es un movimiento; sin ellos, un parche de campos.
// Dos operaciones distintas del servicio bajo el mismo verbo porque para el
// cliente es "editar esta entrada": el que la arrastra y el que le sube las
// raciones hacen lo mismo desde fuera. entryId lo pone la ruta, no el cuerpo.
const MovePatchSchema = PlanEntryMoveSchema.omit({ entryId: true })

export async function PATCH(request: Request, routeCtx: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:write'])
    const { id } = await routeCtx.params
    requireId(id, 'Entrada no encontrada')
    const raw = await readJson(request)
    const asMove = MovePatchSchema.safeParse(raw)
    if (asMove.success) return Response.json(await moveEntry(ctx, { entryId: id, ...asMove.data }))
    const asPatch = PlanEntryPatchSchema.safeParse(raw)
    if (!asPatch.success) return apiError('validation', asPatch.error.issues[0]?.message ?? 'Datos inválidos', 400)
    return Response.json(await patchEntry(ctx, id, asPatch.data))
  } catch (e) {
    return apiFailure(e)
  }
}

export async function DELETE(request: Request, routeCtx: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:write'])
    const { id } = await routeCtx.params
    requireId(id, 'Entrada no encontrada')
    // applyBatch ignora los ids que no son del hogar: se comprueba el resultado
    // para devolver 404 en vez de un 204 que mentiría.
    const { removed } = await applyBatch(ctx, { add: [], remove: [id] })
    if (removed.length === 0) return apiError('not_found', 'Entrada no encontrada', 404)
    return new Response(null, { status: 204 })
  } catch (e) {
    return apiFailure(e)
  }
}
