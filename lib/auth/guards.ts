import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/db'
import type { ApiScope } from '@/db/schema'
import type { Ctx } from './ctx'
import { ApiAuthError, authenticateApiToken } from './api-tokens'
import { SESSION_COOKIE } from './cookies'
import { resolveSession, type SessionWithUser } from './session'

// Una resolución por petición (React cache)
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const jar = await cookies()
  return resolveSession(db, jar.get(SESSION_COOKIE)?.value)
})

export async function requireSession(): Promise<SessionWithUser> {
  const s = await getCurrentSession()
  if (!s) redirect('/login')
  return s
}

export async function requireHousehold(): Promise<Ctx & { session: SessionWithUser }> {
  const s = await requireSession()
  return { db, householdId: s.household.id, userId: s.user.id, apiTokenId: null, role: s.role, locale: s.user.locale === 'en' ? 'en' : 'es', scopes: [], session: s }
}

export async function requireRole(role: 'owner'): Promise<Ctx & { session: SessionWithUser }> {
  const ctx = await requireHousehold()
  if (ctx.role !== role) redirect('/today')
  return ctx
}

// Para REST y MCP: Bearer rz_… o, si no hay cabecera, la cookie de sesión (la UI llama a /api/v1 desde el navegador)
export async function requireApiToken(request: Request, scopes: ApiScope[]): Promise<Ctx> {
  const auth = request.headers.get('authorization') ?? undefined
  if (auth) return authenticateApiToken(db, auth, scopes)
  const s = await getCurrentSession()
  if (!s) throw new ApiAuthError(401, 'No autenticado')
  return { db, householdId: s.household.id, userId: s.user.id, apiTokenId: null, role: s.role, locale: s.user.locale === 'en' ? 'en' : 'es', scopes: [] }
}

export function apiErrorResponse(e: unknown): Response {
  if (e instanceof ApiAuthError) return Response.json({ error: { code: e.status === 401 ? 'unauthorized' : 'forbidden', message: e.message } }, { status: e.status })
  throw e
}

export async function currentUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')
}
