import { cookies } from 'next/headers'
import { PREFS_COOKIE, SESSION_COOKIE } from '@/lib/auth/cookies'
import { logoutSession } from '@/lib/services/auth'

export async function POST(): Promise<Response> {
  const jar = await cookies()
  await logoutSession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
  jar.delete(PREFS_COOKIE)
  return Response.json({ ok: true, redirect: '/login' })
}
