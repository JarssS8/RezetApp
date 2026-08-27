import { requireApiToken } from '@/lib/auth/guards'
import { decideProposal } from '@/lib/services/plan'
import { ProposalDecisionSchema } from '@/lib/validation/plan'
import { apiFailure, parseBody, requireId } from '../../../_lib/respond'

// Aprobar es POST, no PATCH: no cambia un campo, aplica el lote entero en una
// transacción. decideProposal exige ctx.userId != null, así que un token con
// Bearer recibe 403: la IA propone, la persona aprueba (docs/05-MCP.md).
export async function POST(request: Request, routeCtx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:write'])
    const { id } = await routeCtx.params
    requireId(id, 'Propuesta no encontrada')
    const body = await parseBody(request, ProposalDecisionSchema)
    if (!body.ok) return body.response
    return Response.json(await decideProposal(ctx, id, body.data.decision))
  } catch (e) {
    return apiFailure(e)
  }
}
