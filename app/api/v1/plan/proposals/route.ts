import { requireApiToken } from '@/lib/auth/guards'
import { ProposalsQuerySchema } from '@/lib/openapi/document'
import { createProposal, listProposals } from '@/lib/services/plan'
import { ProposalPayloadSchema } from '@/lib/validation/plan'
import { apiError, apiFailure, parseBody } from '../../_lib/respond'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:read'])
    const parsed = ProposalsQuerySchema.safeParse({ status: new URL(request.url).searchParams.get('status') ?? undefined })
    if (!parsed.success) return apiError('validation', parsed.error.issues[0]?.message ?? 'Consulta inválida', 400)
    return Response.json(await listProposals(ctx, parsed.data.status))
  } catch (e) {
    return apiFailure(e)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['plan:write'])
    const body = await parseBody(request, ProposalPayloadSchema)
    if (!body.ok) return body.response
    // source 'mcp' también cuando entra por REST: es el mismo caso de uso
    // -un cliente externo propone y una persona aprueba- y ProposalSourceSchema
    // (congelado) solo admite 'ai' | 'rules' | 'mcp'.
    return Response.json(await createProposal(ctx, { source: 'mcp', payload: body.data }), { status: 201 })
  } catch (e) {
    return apiFailure(e)
  }
}
