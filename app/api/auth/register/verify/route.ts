import { startSessionFor } from '@/lib/auth/set-session-cookie'
import { registerVerify } from '@/lib/services/auth'
import { ServiceError } from '@/lib/services/ctx'
import { RegisterVerifyBodySchema } from '@/lib/validation/household'

export async function POST(request: Request): Promise<Response> {
  const parsed = RegisterVerifyBodySchema.safeParse(await request.json())
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
    return Response.json({ error: { code: 'webauthn', message: e instanceof Error ? e.message : 'Error' } }, { status: 400 })
  }
}
