import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import { createSession, destroySession, resolveSession, switchHousehold } from './session'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
let userId: string
let h1: string
let h2: string

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  const [a] = await db.insert(schema.households).values({ name: 'Casa A' }).returning()
  const [b] = await db.insert(schema.households).values({ name: 'Casa B' }).returning()
  if (!u || !a || !b) throw new Error('seed')
  userId = u.id; h1 = a.id; h2 = b.id
  await db.insert(schema.householdMembers).values([{ householdId: h1, userId, role: 'owner' }, { householdId: h2, userId, role: 'member' }])
})

describe('session', () => {
  it('crea sesión y la resuelve desde la cookie firmada', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: 'test' })
    expect(s.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]+$/)
    const r = await resolveSession(db, s.cookieValue)
    expect(r?.user.id).toBe(userId)
    expect(r?.session.householdId).toBe(h1)
    expect(r?.role).toBe('owner')
  })
  it('cookie manipulada o sesión caducada → null', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: null })
    expect(await resolveSession(db, s.cookieValue.slice(0, -2) + 'zz')).toBeNull()
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    expect(await resolveSession(db, s.cookieValue)).toBeNull()
  })
  it('cambiar de hogar solo a uno del que es miembro', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: null })
    await switchHousehold(db, s.id, h2)
    expect((await resolveSession(db, s.cookieValue))?.session.householdId).toBe(h2)
    await expect(switchHousehold(db, s.id, '00000000-0000-0000-0000-000000000000')).rejects.toThrow()
  })
  it('destruir invalida', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: null })
    await destroySession(db, s.id)
    expect(await resolveSession(db, s.cookieValue)).toBeNull()
  })
})
