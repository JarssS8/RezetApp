import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { addCredentialToUser, type VerifiedCredential } from '@/lib/auth/webauthn'
import { acceptInvite, createInvite, createUserWithHousehold } from './households'
import type { Ctx } from './ctx'
import { listPasskeys, removePasskey, renamePasskey } from './passkeys'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es', scopes: [] })

async function addAsMember(householdId: string, ownerId: string, memberUserId: string): Promise<void> {
  const inv = await createInvite(ctxOf(householdId, ownerId, 'owner'))
  await acceptInvite(db, { token: inv.token, userId: memberUserId })
}

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('listPasskeys', () => {
  it('devuelve solo las passkeys del usuario de la sesión, nunca la clave pública', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('b1'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await addCredentialToUser(db, a.userId, cred('a2'), 'Portátil')

    const rows = await listPasskeys(ctxOf(a.householdId, a.userId, 'owner'))
    expect(rows.map((r) => r.credentialId).sort()).toEqual(['a1', 'a2'])
    expect(rows.find((r) => r.credentialId === 'a2')?.name).toBe('Portátil')
    for (const row of rows) expect(row).not.toHaveProperty('publicKey')
  })
})

describe('renamePasskey', () => {
  it('renombra una passkey propia', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    await renamePasskey(ctxOf(a.householdId, a.userId, 'owner'), 'a1', 'Móvil')
    const rows = await listPasskeys(ctxOf(a.householdId, a.userId, 'owner'))
    expect(rows[0]?.name).toBe('Móvil')
  })

  it('da not_found si la passkey no existe o es de otro usuario', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('b1'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await expect(renamePasskey(ctxOf(a.householdId, b.userId, 'member'), 'a1', 'Móvil')).rejects.toMatchObject({ code: 'not_found' })
    await expect(renamePasskey(ctxOf(a.householdId, a.userId, 'owner'), 'no-existe', 'Móvil')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('removePasskey', () => {
  it('elimina una passkey propia cuando no es la única', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    await addCredentialToUser(db, a.userId, cred('a2'), null)
    await removePasskey(ctxOf(a.householdId, a.userId, 'owner'), 'a2')
    const rows = await listPasskeys(ctxOf(a.householdId, a.userId, 'owner'))
    expect(rows.map((r) => r.credentialId)).toEqual(['a1'])
  })

  it('da conflict al intentar eliminar la única passkey', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    await expect(removePasskey(ctxOf(a.householdId, a.userId, 'owner'), 'a1')).rejects.toMatchObject({ code: 'conflict' })
    const rows = await listPasskeys(ctxOf(a.householdId, a.userId, 'owner'))
    expect(rows).toHaveLength(1)
  })

  it('da not_found si la passkey no existe o es de otro usuario', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('b1'), locale: 'en' })
    await addAsMember(a.householdId, a.userId, b.userId)
    await addCredentialToUser(db, a.userId, cred('a2'), null)
    await expect(removePasskey(ctxOf(a.householdId, b.userId, 'member'), 'a1')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('aislamiento: un usuario de otro hogar no ve ni puede tocar las passkeys ajenas', async () => {
    await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('a1'), locale: 'es' })
    const c = await createUserWithHousehold(db, { displayName: 'Cai', credential: cred('c1'), locale: 'es' })
    expect(await listPasskeys(ctxOf(c.householdId, c.userId, 'owner'))).toHaveLength(1)
    await expect(renamePasskey(ctxOf(c.householdId, c.userId, 'owner'), 'a1', 'x')).rejects.toMatchObject({ code: 'not_found' })
    await expect(removePasskey(ctxOf(c.householdId, c.userId, 'owner'), 'a1')).rejects.toMatchObject({ code: 'not_found' })
  })
})
