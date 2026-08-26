import { getCurrentSession } from '@/lib/auth/guards'
import { readJson } from '@/lib/auth/http'
import { joinInviteAsCurrentUser } from '@/lib/services/auth'
import { ServiceError } from '@/lib/services/ctx'
import { InviteAcceptBodySchema } from '@/lib/validation/household'

// Usuario ya identificado que acepta una invitación: une la cuenta actual al hogar
export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return Response.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 })
  const body = await readJson(request)
  if (body === null) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const parsed = InviteAcceptBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  try {
    await joinInviteAsCurrentUser({ token: parsed.data.token, sessionId: session.session.id, userId: session.user.id })
    return Response.json({ ok: true, redirect: '/today' })
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'conflict' ? 409 : 400 })
    console.error('invite/accept', e)
    return Response.json({ error: { code: 'invalid_invite', message: 'No se pudo aceptar la invitación' } }, { status: 400 })
  }
}
