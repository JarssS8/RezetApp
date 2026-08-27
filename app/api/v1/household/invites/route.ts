import { requireApiToken } from '@/lib/auth/guards'
import { createInvite } from '@/lib/services/households'
import { apiFailure } from '../../_lib/respond'

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:write'])
    const inv = await createInvite(ctx)
    return Response.json(inv, { status: 201 })
  } catch (e) {
    return apiFailure(e)
  }
}
