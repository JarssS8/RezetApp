import { apiErrorResponse, requireApiToken } from '@/lib/auth/guards'
import { ServiceError } from '@/lib/services/ctx'
import { getHouseholdOverview } from '@/lib/services/households'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:read'])
    const overview = await getHouseholdOverview(ctx)
    return Response.json(overview)
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'forbidden' ? 403 : 404 })
    return apiErrorResponse(e)
  }
}
