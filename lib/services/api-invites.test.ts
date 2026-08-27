import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { POST as postInvites } from '@/app/api/v1/household/invites/route'
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
  // createInvite exige un hogar con propietario real: el token de un
  // miembro sin household:write no basta (guarda por scope, no por rol, pero
  // tokenOwner() sí necesita un usuario del hogar detrás del token).
  const [h] = await state.db.insert(schema.households).values({ name: 'Casa' }).returning()
  const [u] = await state.db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  state.householdId = h!.id
  state.userId = u!.id
  await state.db.insert(schema.householdMembers).values({ householdId: state.householdId, userId: state.userId, role: 'owner' })
})

describe('POST /api/v1/household/invites', () => {
  it('con household:write crea una invitación con url y expiración', async () => {
    const rw = await makeToken(['household:write'])
    const res = await postInvites(req('/api/v1/household/invites', rw, { method: 'POST' }))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { token: string; url: string; expiresAt: string }
    expect(body.token).toBeTruthy()
    expect(body.url).toContain(body.token)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())

    const [row] = await state.db.select().from(schema.householdInvites).where(eq(schema.householdInvites.token, body.token))
    expect(row?.householdId).toBe(state.householdId)
    expect(row?.createdBy).toBe(state.userId)
  })

  it('sin token: 401', async () => {
    const res = await postInvites(req('/api/v1/household/invites', undefined, { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } })
  })

  it('con un token sin household:write: 403', async () => {
    const ro = await makeToken(['household:read'])
    const res = await postInvites(req('/api/v1/household/invites', ro, { method: 'POST' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } })
  })
})
