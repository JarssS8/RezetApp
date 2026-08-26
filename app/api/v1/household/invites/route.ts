import { apiErrorResponse, requireApiToken } from '@/lib/auth/guards'
import { ServiceError } from '@/lib/services/ctx'
import { createInvite } from '@/lib/services/households'

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:read'])
    const inv = await createInvite(ctx)
    return Response.json(inv, { status: 201 })
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'forbidden' ? 403 : 400 })
    return apiErrorResponse(e)
  }
}
