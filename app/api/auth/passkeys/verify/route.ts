import { getCurrentSession } from '@/lib/auth/guards'
import { readJson } from '@/lib/auth/http'
import { passkeyVerify } from '@/lib/services/auth'
import { isUniqueViolation } from '@/lib/services/ctx'
import { PasskeyVerifyBodySchema } from '@/lib/validation/household'

export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return Response.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 })
  const body = await readJson(request)
  if (body === null) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const parsed = PasskeyVerifyBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  try {
    await passkeyVerify(session.user.id, { challengeId: parsed.data.challengeId, response: parsed.data.response, name: parsed.data.name })
    return Response.json({ ok: true })
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ error: { code: 'conflict', message: 'Esta passkey ya está registrada' } }, { status: 409 })
    console.error('passkeys/verify', e)
    // Mensaje fijo: no exponemos el detalle interno al cliente
    return Response.json({ error: { code: 'webauthn', message: 'No se pudo verificar la passkey' } }, { status: 400 })
  }
}
