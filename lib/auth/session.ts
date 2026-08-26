import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { Db } from '@/db/types'
import { getKeys, signValue, verifySignedValue } from './crypto'
import { SESSION_DAYS } from './cookies'

const HOUR_MS = 3_600_000

export interface SessionWithUser {
  session: schema.Session
  user: schema.User
  household: schema.Household
  role: 'owner' | 'member'
}

export async function createSession(db: Db, input: { userId: string; householdId: string; userAgent: string | null }): Promise<{ id: string; cookieValue: string }> {
  const id = randomBytes(32).toString('base64url')
  await db.insert(schema.sessions).values({
    id,
    userId: input.userId,
    householdId: input.householdId,
    userAgent: input.userAgent,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  })
  return { id, cookieValue: signValue(id, getKeys().session) }
}

export async function resolveSession(db: Db, cookieValue: string | undefined): Promise<SessionWithUser | null> {
  if (!cookieValue) return null
  const id = verifySignedValue(cookieValue, getKeys().session)
  if (!id) return null
  const rows = await db
    .select({ session: schema.sessions, user: schema.users, household: schema.households, role: schema.householdMembers.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.households, eq(schema.households.id, schema.sessions.householdId))
    .innerJoin(schema.householdMembers, and(eq(schema.householdMembers.householdId, schema.sessions.householdId), eq(schema.householdMembers.userId, schema.sessions.userId)))
    .where(eq(schema.sessions.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id))
    return null
  }
  // last_seen_at como mucho una vez por hora
  if (Date.now() - row.session.lastSeenAt.getTime() > HOUR_MS) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, id))
  }
  return row
}

export async function switchHousehold(db: Db, sessionId: string, householdId: string): Promise<void> {
  const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1)
  if (!s) throw new Error('Sesión no encontrada')
  const [m] = await db
    .select()
    .from(schema.householdMembers)
    .where(and(eq(schema.householdMembers.userId, s.userId), eq(schema.householdMembers.householdId, householdId)))
    .limit(1)
  if (!m) throw new Error('No eres miembro de ese hogar')
  await db.update(schema.sessions).set({ householdId }).where(eq(schema.sessions.id, sessionId))
}

export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId))
}
