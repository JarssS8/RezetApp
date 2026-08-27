import { requireApiToken } from '@/lib/auth/guards'
import { listMembers, updateMember } from '@/lib/services/members'
import { MemberUpdateSchema } from '@/lib/validation/household'
import { apiFailure, parseBody } from '../../_lib/respond'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:read'])
    return Response.json(await listMembers(ctx))
  } catch (e) {
    return apiFailure(e)
  }
}

// PATCH sobre la colección, con el userId dentro del cuerpo: es lo que pide
// MemberUpdateSchema (congelado en W1) y evita una ruta dinámica más.
export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:write'])
    const body = await parseBody(request, MemberUpdateSchema)
    if (!body.ok) return body.response
    await updateMember(ctx, body.data)
    return Response.json(await listMembers(ctx))
  } catch (e) {
    return apiFailure(e)
  }
}
