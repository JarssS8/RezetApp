import { requireApiToken } from '@/lib/auth/guards'
import { exportAll } from '@/lib/services/recipes'
import { apiFailure } from '../_lib/respond'

// Volcado completo del recetario del hogar, sin ids internos: sirve de copia
// de seguridad y se puede reimportar en otra instancia.
export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:read'])
    return Response.json(await exportAll(ctx))
  } catch (e) {
    return apiFailure(e)
  }
}
