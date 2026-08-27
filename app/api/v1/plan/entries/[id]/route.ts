import { z } from 'zod'
import { requireApiToken } from '@/lib/auth/guards'
import { applyBatch, moveEntry, patchEntry } from '@/lib/services/plan'
import { DateSchema, IdSchema, MealSlotSchema } from '@/lib/validation/common'
import { PlanEntryPatchSchema } from '@/lib/validation/plan'
import { apiError, apiFailure } from '../../../_lib/respond'

type RouteCtx = { params: Promise<{ id: string }> }

// Un PATCH con date+slot es un movimiento; sin ellos, un parche de campos.
// Dos operaciones distintas del servicio bajo el mismo verbo porque para el
// cliente es "editar esta entrada": el que la arrastra y el que le sube las
// raciones hacen lo mismo desde fuera.
const MovePatchSchema = z.strictObject({ date: DateSchema, slot: MealSlotSchema, sortOrder: z.number().int().min(0).default(0) })

export async function PATCH(request: Request, routeCtx: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:write'])
    const { id } = await routeCtx.params
    if (!IdSchema.safeParse(id).success) return apiError('not_found', 'Entrada no encontrada', 404)
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return apiError('validation', 'Cuerpo JSON inválido', 400)
    }
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
    if (!IdSchema.safeParse(id).success) return apiError('not_found', 'Entrada no encontrada', 404)
    // applyBatch ignora los ids que no son del hogar: se comprueba el resultado
    // para devolver 404 en vez de un 204 que mentiría.
    const { removed } = await applyBatch(ctx, { add: [], remove: [id] })
    if (removed.length === 0) return apiError('not_found', 'Entrada no encontrada', 404)
    return new Response(null, { status: 204 })
  } catch (e) {
    return apiFailure(e)
  }
}
