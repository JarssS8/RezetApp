import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from './ctx'
import { acceptInvite, createInvite, createUserWithHousehold, deleteHousehold, getInvite, isRegistrationOpen, leaveHousehold, listHouseholdsOf, registerViaInvite } from './households'
import type { VerifiedCredential } from '@/lib/auth/webauthn'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es', scopes: [] })
const tokenCtxOf = (householdId: string, apiTokenId: string, scopes: string[]): Ctx => ({ db, householdId, userId: null, apiTokenId, role: null, locale: 'es', scopes })

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('registro abierto o cerrado (W1-R18)', () => {
  afterEach(() => {
    delete process.env.ALLOW_OPEN_REGISTRATION
  })
  it('abierto sin usuarios, cerrado con el primero dentro', async () => {
    expect(await isRegistrationOpen(db)).toBe(true)
    await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    expect(await isRegistrationOpen(db)).toBe(false)
  })
  it('ALLOW_OPEN_REGISTRATION=true lo abre aunque haya usuarios', async () => {
    await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    process.env.ALLOW_OPEN_REGISTRATION = 'true'
    expect(await isRegistrationOpen(db)).toBe(true)
    process.env.ALLOW_OPEN_REGISTRATION = 'false'
    expect(await isRegistrationOpen(db)).toBe(false)
  })
})

describe('households', () => {
  it('registro crea usuario, hogar "Casa de X", owner y credencial en una transacción', async () => {
    const r = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const [h] = await db.select().from(schema.households).where(eq(schema.households.id, r.householdId))
    expect(h?.name).toBe('Casa de Ana')
    expect(h?.defaultServings).toBe(2)
    const members = await db.select().from(schema.householdMembers).where(eq(schema.householdMembers.userId, r.userId))
    expect(members[0]?.role).toBe('owner')
    const creds = await db.select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.userId, r.userId))
    expect(creds).toHaveLength(1)
  })
  it('invitación: token de 24 h, aceptar añade como member y marca usada', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    expect(inv.url).toBe(`http://localhost:3000/invite/${inv.token}`)
    expect((await getInvite(db, inv.token))?.householdName).toBe('Casa de Ana')
    await acceptInvite(db, { token: inv.token, userId: b.userId })
    const hs = await listHouseholdsOf(db, b.userId)
    expect(hs.map((h) => h.role).sort()).toEqual(['member', 'owner'])
    await expect(acceptInvite(db, { token: inv.token, userId: b.userId })).rejects.toThrow()
  })
  it('un member no puede invitar', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await expect(createInvite(ctxOf(a.householdId, a.userId, 'member'))).rejects.toThrow()
  })
  it('un token con household:write puede invitar; sin el scope, no', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const [tok] = await db.insert(schema.apiTokens).values({ householdId: a.householdId, userId: a.userId, name: 'mcp', tokenHash: 'hash-1', scopes: ['household:write'] }).returning()
    const [sinScope] = await db.insert(schema.apiTokens).values({ householdId: a.householdId, userId: a.userId, name: 'mcp2', tokenHash: 'hash-2', scopes: ['household:read'] }).returning()
    if (!tok || !sinScope) throw new Error('seed')
    const inv = await createInvite(tokenCtxOf(a.householdId, tok.id, ['household:write']))
    expect((await getInvite(db, inv.token))?.householdName).toBe('Casa de Ana')
    await expect(createInvite(tokenCtxOf(a.householdId, sinScope.id, ['household:read']))).rejects.toThrow()
  })
  it('salir del hogar borra los tokens API de esa persona en ese hogar', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    await acceptInvite(db, { token: inv.token, userId: b.userId })
    await db.insert(schema.apiTokens).values({ householdId: a.householdId, userId: b.userId, name: 'de Bo', tokenHash: 'hash-b', scopes: [] })
    await db.insert(schema.apiTokens).values({ householdId: a.householdId, userId: a.userId, name: 'de Ana', tokenHash: 'hash-a', scopes: [] })
    await leaveHousehold(ctxOf(a.householdId, b.userId, 'member'))
    const rest = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.householdId, a.householdId))
    expect(rest.map((t) => t.name)).toEqual(['de Ana'])
  })
  it('registro vía invitación no crea hogar propio', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    const r = await registerViaInvite(db, { token: inv.token, displayName: 'Cai', credential: cred('c3'), locale: 'es' })
    expect(r.householdId).toBe(a.householdId)
    expect(await listHouseholdsOf(db, r.userId)).toHaveLength(1)
  })
  it('salir: member puede, último owner no', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    await acceptInvite(db, { token: inv.token, userId: b.userId })
    await leaveHousehold(ctxOf(a.householdId, b.userId, 'member'))
    expect(await listHouseholdsOf(db, b.userId)).toHaveLength(1)
    await expect(leaveHousehold(ctxOf(a.householdId, a.userId, 'owner'))).rejects.toThrow()
  })
  it('borrar hogar: solo owner, con nombre exacto, elimina todo su contenido y sesiones', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await db.insert(schema.recipes).values({ householdId: a.householdId, title: 'Lentejas' })
    await db.insert(schema.sessions).values({ id: 's1', userId: a.userId, householdId: a.householdId, expiresAt: new Date(Date.now() + 1000) })
    const [bRecipe] = await db.insert(schema.recipes).values({ householdId: b.householdId, title: 'Tortilla' }).returning()
    await db.insert(schema.sessions).values({ id: 's2', userId: b.userId, householdId: b.householdId, expiresAt: new Date(Date.now() + 1000) })
    await expect(deleteHousehold(ctxOf(a.householdId, a.userId, 'owner'), 'otro nombre')).rejects.toThrow()
    await expect(deleteHousehold(ctxOf(a.householdId, a.userId, 'member'), 'Casa de Ana')).rejects.toThrow()
    await deleteHousehold(ctxOf(a.householdId, a.userId, 'owner'), 'Casa de Ana')
    expect(await db.select().from(schema.households).where(eq(schema.households.id, a.householdId))).toHaveLength(0)
    expect(await db.select().from(schema.recipes).where(eq(schema.recipes.householdId, a.householdId))).toHaveLength(0)
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.householdId, a.householdId))).toHaveLength(0)
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM users`)
    expect((r.rows[0] as { c: number }).c).toBe(2) // los usuarios siguen existiendo
    // Aislamiento: el hogar de Bo y su contenido no se ven afectados
    const [bHousehold] = await db.select().from(schema.households).where(eq(schema.households.id, b.householdId))
    expect(bHousehold?.name).toBe('Casa de Bo')
    expect(await db.select().from(schema.recipes).where(eq(schema.recipes.id, bRecipe!.id))).toHaveLength(1)
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.id, 's2'))).toHaveLength(1)
  })
})
