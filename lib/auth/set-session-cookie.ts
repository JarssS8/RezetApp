import 'server-only'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { PREFS_COOKIE, SESSION_COOKIE, prefsCookieOptions, prefsCookieValue, sessionCookieOptions } from './cookies'
import { createSession } from './session'

export async function startSessionFor(userId: string, householdId: string, userAgent: string | null): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const s = await createSession(db, { userId, householdId, userAgent })
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, s.cookieValue, sessionCookieOptions(appUrl))
  if (user) jar.set(PREFS_COOKIE, prefsCookieValue(user), prefsCookieOptions(appUrl))
}
