import { readJson } from '@/lib/auth/http'
import { registerOptions } from '@/lib/services/auth'
import { RegisterOptionsBodySchema } from '@/lib/validation/household'

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request)
  if (body === null) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const parsed = RegisterOptionsBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const result = await registerOptions(parsed.data.displayName, parsed.data.inviteToken)
  if (!result.ok) return Response.json({ error: { code: 'invalid_invite', message: 'Invitación inválida' } }, { status: 400 })
  return Response.json({ challengeId: result.challengeId, options: result.options })
}
