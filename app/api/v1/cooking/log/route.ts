import { requireApiToken } from '@/lib/auth/guards'
import { logCooked } from '@/lib/services/cooking'
import { LogCookedSchema } from '@/lib/validation/cooking'
import { apiFailure, parseBody } from '../../_lib/respond'

export const runtime = 'nodejs'

// §6 del spec: cooking:write es lo único que hace falta. El scope ya implica
// tocar el plan (marcar cocinada, crear la sobra) y la despensa (descontar):
// exigir además plan:write y pantry:write obligaría a un token maestro, que es
// justo lo que docs/05-MCP.md quiere evitar.
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['cooking:write'])
    const body = await parseBody(request, LogCookedSchema)
    if (!body.ok) return body.response
    return Response.json(await logCooked(ctx, body.data), { status: 201 })
  } catch (e) {
    return apiFailure(e)
  }
}
