import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import { ApiAuthError, authenticateApiToken, generateApiToken, hashToken } from './api-tokens'

let db: TestDb
let householdId: string
let userId: string
beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  const [h] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
  if (!u || !h) throw new Error('seed')
  userId = u.id; householdId = h.id
  await db.insert(schema.householdMembers).values({ householdId, userId, role: 'owner' })
})

describe('api tokens', () => {
  it('genera token con prefijo rz_ y hash sha256', () => {
    const t = generateApiToken()
    expect(t).toMatch(/^rz_[A-Za-z0-9_-]{43}$/)
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })
  it('autentica por Bearer y exige scopes', async () => {
    const token = generateApiToken()
    await db.insert(schema.apiTokens).values({ householdId, userId, name: 'test', tokenHash: hashToken(token), scopes: ['recipes:read'] })
    const ctx = await authenticateApiToken(db, `Bearer ${token}`, ['recipes:read'])
    expect(ctx.householdId).toBe(householdId)
    expect(ctx.userId).toBeNull()
    expect(ctx.apiTokenId).toBeTruthy()
    await expect(authenticateApiToken(db, `Bearer ${token}`, ['recipes:write'])).rejects.toMatchObject({ status: 403 })
    await expect(authenticateApiToken(db, `Bearer rz_falso`, [])).rejects.toMatchObject({ status: 401 })
    await expect(authenticateApiToken(db, undefined, [])).rejects.toBeInstanceOf(ApiAuthError)
  })
  it('el esquema Bearer no distingue mayúsculas', async () => {
    const token = generateApiToken()
    await db.insert(schema.apiTokens).values({ householdId, userId, name: 'test', tokenHash: hashToken(token), scopes: [] })
    for (const prefix of ['bearer', 'BEARER', 'BeArEr']) {
      const ctx = await authenticateApiToken(db, `${prefix} ${token}`, [])
      expect(ctx.householdId).toBe(householdId)
    }
  })
  it('el token de quien ya no es miembro del hogar da 401', async () => {
    const token = generateApiToken()
    await db.insert(schema.apiTokens).values({ householdId, userId, name: 'test', tokenHash: hashToken(token), scopes: ['recipes:read'] })
    await authenticateApiToken(db, `Bearer ${token}`, ['recipes:read'])
    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.userId, userId))
    await expect(authenticateApiToken(db, `Bearer ${token}`, ['recipes:read'])).rejects.toMatchObject({ status: 401 })
  })
  it('token revocado no vale y actualiza last_used_at al usarlo', async () => {
    const token = generateApiToken()
    const [row] = await db.insert(schema.apiTokens).values({ householdId, userId, name: 't', tokenHash: hashToken(token), scopes: [] }).returning()
    await authenticateApiToken(db, `Bearer ${token}`, [])
    const [after] = await db.select().from(schema.apiTokens)
    expect(after?.lastUsedAt).not.toBeNull()
    await db.update(schema.apiTokens).set({ revokedAt: new Date() })
    await expect(authenticateApiToken(db, `Bearer ${token}`, [])).rejects.toMatchObject({ status: 401 })
    expect(row).toBeTruthy()
  })
})
