import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { GET as getMembers, PATCH as patchMembers } from '@/app/api/v1/household/members/route'
import { createMakeToken, req, type ApiTestState } from './api-test-helpers'

// Ver lib/services/api-recipes.test.ts: mismos motivos para los dos mocks.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

const state: ApiTestState = { db: undefined as unknown as TestDb, householdId: '', userId: '' }
const makeToken = createMakeToken(state)

beforeAll(async () => {
  state.db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(state.db)
  const [h] = await state.db.insert(schema.households).values({ name: 'Casa' }).returning()
  const [u] = await state.db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  state.householdId = h!.id
  state.userId = u!.id
  await state.db.insert(schema.householdMembers).values({ householdId: state.householdId, userId: state.userId, role: 'owner' })
})

describe('GET /api/v1/household/members', () => {
  it('devuelve los miembros del hogar con household:read', async () => {
    const t = await makeToken(['household:read'])
    const res = await getMembers(req('/api/v1/household/members', t))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string; role: string }[]
    expect(body).toEqual([expect.objectContaining({ userId: state.userId, role: 'owner' })])
  })

  it('sin el scope correcto es 403', async () => {
    const t = await makeToken(['plan:read'])
    expect((await getMembers(req('/api/v1/household/members', t))).status).toBe(403)
  })
})

describe('PATCH /api/v1/household/members', () => {
  it('sin household:write es 403', async () => {
    const t = await makeToken(['household:read'])
    const res = await patchMembers(
      req('/api/v1/household/members', t, { method: 'PATCH', body: JSON.stringify({ userId: state.userId, allergens: ['gluten'] }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(403)
  })

  it('un cuerpo mal formado (campo desconocido) es 400', async () => {
    const t = await makeToken(['household:write'])
    const res = await patchMembers(
      req('/api/v1/household/members', t, { method: 'PATCH', body: JSON.stringify({ userId: state.userId, notAField: true }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(400)
  })

  // updateMember (lib/services/members.ts) exige ser el propietario o editarse
  // a uno mismo; un token de API no tiene ni rol ni identidad de usuario
  // (authenticateApiToken devuelve role: null, userId: null a propósito, ver
  // lib/auth/api-tokens.ts), así que la edición de miembros por REST/MCP con
  // un token queda siempre fuera, aunque el token tenga household:write: la
  // pantalla de ajustes (con cookie de sesión) es la única vía real.
  it('con household:write pero por token (sin rol de propietario) sigue siendo 403', async () => {
    const t = await makeToken(['household:write'])
    const res = await patchMembers(
      req('/api/v1/household/members', t, { method: 'PATCH', body: JSON.stringify({ userId: state.userId, allergens: ['gluten'] }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(403)
  })
})
