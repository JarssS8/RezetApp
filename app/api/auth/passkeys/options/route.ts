import { getCurrentSession } from '@/lib/auth/guards'
import { passkeyOptions } from '@/lib/services/auth'

// Tarea 36: alta de una passkey adicional desde ajustes; requiere sesión (a
// diferencia de /api/auth/register/options, que la crea).
export async function POST(): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return Response.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 })
  const result = await passkeyOptions(session.user.id, session.user.displayName)
  return Response.json(result)
}
