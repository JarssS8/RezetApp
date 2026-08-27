import { getCurrentSession } from '@/lib/auth/guards'
import { readJson } from '@/lib/auth/http'
import { db, subscribePush } from '@/lib/services/push'
import { PushSubscriptionSchema } from '@/lib/validation/push'

// Fuera de /api/v1 a propósito: es de la interfaz (cookie de sesión), no de la
// API pública con Bearer y scopes, y por eso no entra en el contrato de
// tests/contracts/api-surface.test.ts.
export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return Response.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 })
  const parsed = PushSubscriptionSchema.safeParse(await readJson(request))
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Suscripción inválida' } }, { status: 400 })
  await subscribePush(db, session.user.id, parsed.data)
  return new Response(null, { status: 204 })
}
