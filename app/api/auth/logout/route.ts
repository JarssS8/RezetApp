import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth/cookies'
import { PREFS_COOKIE } from '@/lib/prefs'
import { logoutSession } from '@/lib/services/auth'

export async function POST(): Promise<Response> {
  const jar = await cookies()
  await logoutSession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
  jar.delete(PREFS_COOKIE)
  return Response.json({ ok: true, redirect: '/login' })
}
