import { requireApiToken } from '@/lib/auth/guards'
import { getHouseholdOverview } from '@/lib/services/households'
import { apiFailure } from '../_lib/respond'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:read'])
    return Response.json(await getHouseholdOverview(ctx))
  } catch (e) {
    return apiFailure(e)
  }
}
