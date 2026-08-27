import { requireApiToken } from '@/lib/auth/guards'
import { applyBatch } from '@/lib/services/plan'
import { PlanBatchSchema } from '@/lib/validation/plan'
import { apiFailure, parseBody } from '../../_lib/respond'

// Alta y baja de entradas en un único lote transaccional (lib/services/plan.ts::applyBatch).
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:write'])
    const body = await parseBody(request, PlanBatchSchema)
    if (!body.ok) return body.response
    return Response.json(await applyBatch(ctx, body.data))
  } catch (e) {
    return apiFailure(e)
  }
}
