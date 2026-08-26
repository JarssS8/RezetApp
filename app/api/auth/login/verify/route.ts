import { startSessionFor } from '@/lib/auth/set-session-cookie'
import { loginVerify } from '@/lib/services/auth'
import { LoginVerifyBodySchema } from '@/lib/validation/household'

export async function POST(request: Request): Promise<Response> {
  const parsed = LoginVerifyBodySchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const { challengeId, inviteToken, response } = parsed.data
  try {
    const r = await loginVerify({ challengeId, inviteToken, response })
    if (!r) return Response.json({ error: { code: 'no_household', message: 'Sin hogar' } }, { status: 409 })
    await startSessionFor(r.userId, r.householdId, request.headers.get('user-agent'))
    return Response.json({ ok: true, redirect: '/today' })
  } catch (e) {
    return Response.json({ error: { code: 'webauthn', message: e instanceof Error ? e.message : 'Error' } }, { status: 401 })
  }
}
