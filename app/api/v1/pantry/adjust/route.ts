import { requireApiToken } from '@/lib/auth/guards'
import { adjustPantryItem } from '@/lib/services/pantry'
import { PantryAdjustSchema } from '@/lib/validation/pantry'
import { apiFailure, parseBody } from '../../_lib/respond'

// Deltas, no absolutos: dos ajustes simultáneos no se pisan porque el servicio
// hace GREATEST(0, quantity + delta) en una sola sentencia.
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['pantry:write'])
    const body = await parseBody(request, PantryAdjustSchema)
    if (!body.ok) return body.response
    return Response.json(await adjustPantryItem(ctx, body.data))
  } catch (e) {
    return apiFailure(e)
  }
}
