import { readJson } from '@/lib/auth/http'
import { startSessionFor } from '@/lib/auth/set-session-cookie'
import { registerVerify } from '@/lib/services/auth'
import { isUniqueViolation, ServiceError } from '@/lib/services/ctx'
import { RegisterVerifyBodySchema } from '@/lib/validation/household'

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request)
  if (body === null) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const parsed = RegisterVerifyBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const { challengeId, displayName, inviteToken, locale, response } = parsed.data
  try {
    const r = await registerVerify({ challengeId, displayName, inviteToken, locale, response })
    await startSessionFor(r.userId, r.householdId, request.headers.get('user-agent'))
    return Response.json({ ok: true, redirect: '/today' })
  } catch (e) {
    if (e instanceof ServiceError) {
      const status = e.code === 'conflict' ? 409 : e.code === 'forbidden' ? 403 : 400
      return Response.json({ error: { code: e.code, message: e.message } }, { status })
    }
    console.error('register/verify', e)
    if (isUniqueViolation(e)) return Response.json({ error: { code: 'conflict', message: 'Esta passkey ya está registrada' } }, { status: 409 })
    // Mensaje fijo: no exponemos el detalle interno (p. ej. errores de Postgres) al cliente
    return Response.json({ error: { code: 'webauthn', message: 'No se pudo verificar la passkey' } }, { status: 400 })
  }
}
