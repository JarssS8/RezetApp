import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { VerifiedCredential } from '@/lib/auth/webauthn'
import type { Ctx } from './ctx'
import { createUserWithHousehold } from './households'
import { createApiToken, listApiTokens, revokeApiToken } from './api-tokens'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es', scopes: [] })

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('api-tokens', () => {
  it('crear devuelve rz_… en claro y guarda solo el hash', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const created = await createApiToken(ctxOf(a.householdId, a.userId, 'owner'), { name: 'MCP escritorio', scopes: ['recipes:read'], mcpProfile: 'basic' })
    expect(created.token).toMatch(/^rz_/)
    const [row] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, created.id))
    expect(row?.tokenHash).toBeTruthy()
    expect(row?.tokenHash).not.toBe(created.token)
  })

  it('listar no expone el hash ni el token en claro', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await createApiToken(ctxOf(a.householdId, a.userId, 'owner'), { name: 'MCP', scopes: ['recipes:read'], mcpProfile: 'full' })
    const [t] = await listApiTokens(ctxOf(a.householdId, a.userId, 'owner'))
    expect(t).toMatchObject({ name: 'MCP', scopes: ['recipes:read'], mcpProfile: 'full', revokedAt: null })
    expect(t).not.toHaveProperty('tokenHash')
    expect(t).not.toHaveProperty('token')
    expect(t?.lastUsedAt).toBeNull()
  })

  it('revocar marca revoked_at y es idempotente', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const created = await createApiToken(ctxOf(a.householdId, a.userId, 'owner'), { name: 'MCP', scopes: [], mcpProfile: 'basic' })
    await revokeApiToken(ctxOf(a.householdId, a.userId, 'owner'), created.id)
    const [row] = await listApiTokens(ctxOf(a.householdId, a.userId, 'owner'))
    expect(row?.revokedAt).not.toBeNull()
    await expect(revokeApiToken(ctxOf(a.householdId, a.userId, 'owner'), created.id)).resolves.toBeUndefined()
  })

  it('un member no puede crear ni revocar tokens', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await expect(createApiToken(ctxOf(a.householdId, a.userId, 'member'), { name: 'x', scopes: [], mcpProfile: 'basic' })).rejects.toMatchObject({ code: 'forbidden' })
    const created = await createApiToken(ctxOf(a.householdId, a.userId, 'owner'), { name: 'x', scopes: [], mcpProfile: 'basic' })
    await expect(revokeApiToken(ctxOf(a.householdId, a.userId, 'member'), created.id)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('aislamiento: el hogar B no ve ni puede revocar los tokens del hogar A', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const created = await createApiToken(ctxOf(a.householdId, a.userId, 'owner'), { name: 'de Ana', scopes: [], mcpProfile: 'basic' })
    expect(await listApiTokens(ctxOf(b.householdId, b.userId, 'owner'))).toHaveLength(0)
    await expect(revokeApiToken(ctxOf(b.householdId, b.userId, 'owner'), created.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})
