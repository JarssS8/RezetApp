import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { VerifiedCredential } from '@/lib/auth/webauthn'
import type { Ctx } from './ctx'
import { acceptInvite, createInvite, createUserWithHousehold } from './households'
import { listMembers, removeMember, updateMember } from './members'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es', scopes: [] })

// Invita y acepta: b entra en el hogar de a como member sin perder su
// propio hogar (mismo patrón que households.test.ts).
async function addAsMember(householdId: string, ownerId: string, memberUserId: string): Promise<void> {
  const inv = await createInvite(ctxOf(householdId, ownerId, 'owner'))
  await acceptInvite(db, { token: inv.token, userId: memberUserId })
}

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('listMembers', () => {
  it('devuelve los miembros del hogar con su rol', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    const members = await listMembers(ctxOf(a.householdId, a.userId, 'owner'))
    expect(members).toHaveLength(2)
    expect(members.find((m) => m.userId === a.userId)?.role).toBe('owner')
    expect(members.find((m) => m.userId === b.userId)?.role).toBe('member')
  })
})

describe('updateMember', () => {
  it('el propietario edita los alérgenos y preferencias de cualquier miembro', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await updateMember(ctxOf(a.householdId, a.userId, 'owner'), { userId: b.userId, allergens: ['gluten', 'nuts'], dietaryFlags: ['vegetariano'] })
    const [row] = await db.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.userId, b.userId)))
    expect(row?.allergens).toEqual(['gluten', 'nuts'])
    expect(row?.dietaryFlags).toEqual(['vegetariano'])
  })

  it('un miembro puede editarse a sí mismo pero no a otro', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await updateMember(ctxOf(a.householdId, b.userId, 'member'), { userId: b.userId, allergens: ['lactose'] })
    const [row] = await db.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.userId, b.userId)))
    expect(row?.allergens).toEqual(['lactose'])
    await expect(updateMember(ctxOf(a.householdId, b.userId, 'member'), { userId: a.userId, allergens: ['egg'] })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('recorta y deduplica las preferencias libres', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await updateMember(ctxOf(a.householdId, a.userId, 'owner'), { userId: a.userId, dietaryFlags: [' vegano ', 'vegano', 'sin gluten', '   '] })
    const [row] = await db.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.userId, a.userId)))
    expect(row?.dietaryFlags).toEqual(['vegano', 'sin gluten'])
  })

  it('deduplica los alérgenos', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await updateMember(ctxOf(a.householdId, a.userId, 'owner'), { userId: a.userId, allergens: ['gluten', 'gluten', 'egg'] })
    const [row] = await db.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.userId, a.userId)))
    expect(row?.allergens).toEqual(['gluten', 'egg'])
  })

  it('miembro inexistente en el hogar da not_found', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await expect(updateMember(ctxOf(a.householdId, a.userId, 'owner'), { userId: b.userId, allergens: ['egg'] })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('removeMember', () => {
  it('el propietario expulsa a un miembro: borra membresía, sesiones y tokens de ese hogar', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await db.insert(schema.sessions).values({ id: 's-b-a', userId: b.userId, householdId: a.householdId, expiresAt: new Date(Date.now() + 1000) })
    await db.insert(schema.sessions).values({ id: 's-b-b', userId: b.userId, householdId: b.householdId, expiresAt: new Date(Date.now() + 1000) })
    await db.insert(schema.apiTokens).values({ householdId: a.householdId, userId: b.userId, name: 'de Bo en A', tokenHash: 'hash-1', scopes: [] })
    await db.insert(schema.apiTokens).values({ householdId: b.householdId, userId: b.userId, name: 'de Bo en su hogar', tokenHash: 'hash-2', scopes: [] })

    await removeMember(ctxOf(a.householdId, a.userId, 'owner'), b.userId)

    expect(await db.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.userId, b.userId)))).toHaveLength(0)
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.id, 's-b-a'))).toHaveLength(0)
    expect(await db.select().from(schema.apiTokens).where(and(eq(schema.apiTokens.householdId, a.householdId), eq(schema.apiTokens.userId, b.userId)))).toHaveLength(0)
    // Su hogar propio no se ve afectado
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.id, 's-b-b'))).toHaveLength(1)
    expect(await db.select().from(schema.apiTokens).where(and(eq(schema.apiTokens.householdId, b.householdId), eq(schema.apiTokens.userId, b.userId)))).toHaveLength(1)
  })

  it('un member no puede expulsar', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await expect(removeMember(ctxOf(a.householdId, b.userId, 'member'), a.userId)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('el propietario no puede expulsarse a sí mismo', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await expect(removeMember(ctxOf(a.householdId, a.userId, 'owner'), a.userId)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('no se puede expulsar al último propietario aunque lo intente otro owner', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    // b es member; a es el único owner del hogar. Se simula un ctx de owner
    // ajeno (b) para probar la guarda del último propietario en aislamiento
    // de la comprobación de "no expulsarse a sí mismo".
    await expect(removeMember(ctxOf(a.householdId, b.userId, 'owner'), a.userId)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('con dos propietarios sí se puede expulsar a uno de ellos', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await db.update(schema.householdMembers).set({ role: 'owner' }).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.userId, b.userId)))
    await removeMember(ctxOf(a.householdId, b.userId, 'owner'), a.userId)
    const owners = await db.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, a.householdId), eq(schema.householdMembers.role, 'owner')))
    expect(owners).toHaveLength(1)
    expect(owners[0]?.userId).toBe(b.userId)
  })

  it('miembro inexistente en el hogar da not_found', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await expect(removeMember(ctxOf(a.householdId, a.userId, 'owner'), b.userId)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('aislamiento: el hogar B no ve ni puede expulsar a los miembros del hogar A', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const c = await createUserWithHousehold(db, { displayName: 'Cai', credential: cred('c3'), locale: 'es' })
    await addAsMember(a.householdId, a.userId, c.userId)
    expect(await listMembers(ctxOf(b.householdId, b.userId, 'owner'))).toHaveLength(1)
    await expect(removeMember(ctxOf(b.householdId, b.userId, 'owner'), c.userId)).rejects.toMatchObject({ code: 'not_found' })
  })
})
