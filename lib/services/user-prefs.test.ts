import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { VerifiedCredential } from '@/lib/auth/webauthn'
import type { Ctx } from './ctx'
import { createUserWithHousehold } from './households'
import { updateUserPrefs } from './user-prefs'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string | null, apiTokenId: string | null = null): Ctx => ({
  db,
  householdId,
  userId,
  apiTokenId,
  role: 'owner',
  locale: 'es',
  scopes: [],
})

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('user-prefs', () => {
  it('actualiza los campos de users del usuario de la sesión y los devuelve', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const updated = await updateUserPrefs(ctxOf(a.householdId, a.userId), { displayName: 'Ana María', theme: 'dark', accent: 'miel', locale: 'en', units: 'imperial' })
    expect(updated).toMatchObject({ id: a.userId, displayName: 'Ana María', theme: 'dark', accent: 'miel', locale: 'en', units: 'imperial' })
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, a.userId))
    expect(row).toMatchObject({ displayName: 'Ana María', theme: 'dark', accent: 'miel', locale: 'en', units: 'imperial' })
  })

  it('solo cambia los campos presentes en el input', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const updated = await updateUserPrefs(ctxOf(a.householdId, a.userId), { accent: 'tomate' })
    expect(updated).toMatchObject({ displayName: 'Ana', accent: 'tomate', theme: 'system', locale: 'es', units: 'metric' })
  })

  it('un token sin usuario asociado no puede cambiar preferencias', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await expect(updateUserPrefs(ctxOf(a.householdId, null, 'algún-token-id'), { accent: 'tomate' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('aislamiento: cambiar las preferencias de un usuario del hogar A no toca al hogar B', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    await updateUserPrefs(ctxOf(a.householdId, a.userId), { accent: 'tomate' })
    const [rowB] = await db.select().from(schema.users).where(eq(schema.users.id, b.userId))
    expect(rowB?.accent).toBe('huerta')
  })
})
