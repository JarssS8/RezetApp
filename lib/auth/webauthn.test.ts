import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { ChallengeUserMismatchError, finishRegistration, getRp, startLogin, startRegistration } from './webauthn'

process.env.APP_URL = 'http://localhost:3000'
let db: TestDb
beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('webauthn', () => {
  it('rpID y origin salen de APP_URL', () => {
    expect(getRp()).toEqual({ rpID: 'localhost', origin: 'http://localhost:3000', rpName: 'RezetApp' })
    process.env.APP_URL = 'https://recetas.ejemplo.es'
    expect(getRp()).toEqual({ rpID: 'recetas.ejemplo.es', origin: 'https://recetas.ejemplo.es', rpName: 'RezetApp' })
    process.env.APP_URL = 'http://localhost:3000'
  })
  it('opciones de registro exigen credencial descubrible y guardan el reto 5 min', async () => {
    const { challengeId, options } = await startRegistration(db, 'Ana')
    expect(options.authenticatorSelection?.residentKey).toBe('required')
    expect(options.authenticatorSelection?.userVerification).toBe('preferred')
    expect(options.rp.id).toBe('localhost')
    expect(options.user.name).toBe('Ana')
    const r = await db.execute(sql`SELECT kind, expires_at FROM webauthn_challenges WHERE id = ${challengeId}`)
    const row = r.rows[0] as { kind: string; expires_at: string }
    expect(row.kind).toBe('register')
    // db.execute() sin esquema devuelve el timestamp como texto (drizzle no lo parsea aquí)
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(4 * 60_000)
  })
  it('opciones de login no restringen credenciales', async () => {
    const { options } = await startLogin(db)
    expect(options.allowCredentials === undefined || options.allowCredentials.length === 0).toBe(true)
    expect(options.rpId).toBe('localhost')
  })
  it('registrar con un usuario que ya tiene passkey excluye esa credencial', async () => {
    const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
    if (!u) throw new Error('seed')
    await db.insert(schema.webauthnCredentials).values({
      credentialId: 'cred-existente',
      userId: u.id,
      publicKey: Buffer.from('clave'),
      deviceType: 'singleDevice',
    })
    const { options } = await startRegistration(db, 'Ana', u.id)
    expect(options.excludeCredentials?.map((c) => c.id)).toContain('cred-existente')
  })

  it('finishRegistration rechaza un reto pedido para otro usuario y no guarda ninguna credencial', async () => {
    const [userA] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
    const [userB] = await db.insert(schema.users).values({ displayName: 'Bo' }).returning()
    if (!userA || !userB) throw new Error('seed')
    const { challengeId } = await startRegistration(db, 'Ana', userA.id)
    const fakeResponse = {} as unknown as RegistrationResponseJSON
    await expect(finishRegistration(db, { challengeId, response: fakeResponse, expectedUserId: userB.id })).rejects.toBeInstanceOf(ChallengeUserMismatchError)
    expect(await db.select().from(schema.webauthnCredentials)).toHaveLength(0)
  })
})
