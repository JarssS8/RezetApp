import { readJson } from '@/lib/auth/http'
import { startSessionFor } from '@/lib/auth/set-session-cookie'
import { loginVerify } from '@/lib/services/auth'
import { LoginVerifyBodySchema } from '@/lib/validation/household'

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request)
  if (body === null) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const parsed = LoginVerifyBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const { challengeId, inviteToken, response } = parsed.data
  try {
    const r = await loginVerify({ challengeId, inviteToken, response })
    if (!r) return Response.json({ error: { code: 'no_household', message: 'Sin hogar' } }, { status: 409 })
    await startSessionFor(r.userId, r.householdId, request.headers.get('user-agent'))
    return Response.json({ ok: true, redirect: '/today', inviteError: r.inviteError })
  } catch (e) {
    console.error('login/verify', e)
    // Mensaje fijo: no exponemos el detalle interno al cliente
    return Response.json({ error: { code: 'webauthn', message: 'No se pudo verificar la passkey' } }, { status: 401 })
  }
}
