import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { GET as getPlan } from '@/app/api/v1/plan/route'
import { POST as postEntries } from '@/app/api/v1/plan/entries/route'
import { DELETE as deleteEntry, PATCH as patchEntryRoute } from '@/app/api/v1/plan/entries/[id]/route'
import { GET as getProposals, POST as postProposals } from '@/app/api/v1/plan/proposals/route'
import { POST as postDecision } from '@/app/api/v1/plan/proposals/[id]/route'
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

describe('/api/v1/plan', () => {
  it('GET /plan devuelve entradas y nutrición del rango', async () => {
    const ro = await makeToken(['plan:read'])
    const res = await getPlan(req('/api/v1/plan?from=2026-08-24&to=2026-08-30', ro))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[]; nutrition: { total: { kcal: number } } }
    expect(Array.isArray(body.entries)).toBe(true)
    expect(body.nutrition.total).toBeDefined()
  })

  it('un rango de más de 92 días es 400', async () => {
    const ro = await makeToken(['plan:read'])
    expect((await getPlan(req('/api/v1/plan?from=2026-01-01&to=2026-12-31', ro))).status).toBe(400)
  })

  it('POST /plan/entries aplica el lote y PATCH cambia raciones', async () => {
    const rw = await makeToken(['plan:read', 'plan:write'])
    const created = await postEntries(
      req('/api/v1/plan/entries', rw, {
        method: 'POST',
        body: JSON.stringify({ add: [{ date: '2026-08-27', slot: 'dinner', customTitle: 'Pizza', servings: 2 }], remove: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(created.status).toBe(200)
    const { added } = (await created.json()) as { added: { id: string }[] }
    const id = added[0]!.id
    const patched = await patchEntryRoute(
      req(`/api/v1/plan/entries/${id}`, rw, { method: 'PATCH', body: JSON.stringify({ servings: 4 }), headers: { 'content-type': 'application/json' } }),
      { params: Promise.resolve({ id }) },
    )
    expect((await patched.json()).servings).toBe(4)
  })

  it('PATCH con date+slot mueve la entrada en vez de parchearla', async () => {
    const rw = await makeToken(['plan:read', 'plan:write'])
    const created = await postEntries(
      req('/api/v1/plan/entries', rw, {
        method: 'POST',
        body: JSON.stringify({ add: [{ date: '2026-08-27', slot: 'dinner', customTitle: 'Pizza', servings: 2 }], remove: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { added } = (await created.json()) as { added: { id: string }[] }
    const id = added[0]!.id
    const moved = await patchEntryRoute(
      req(`/api/v1/plan/entries/${id}`, rw, {
        method: 'PATCH',
        body: JSON.stringify({ date: '2026-08-28', slot: 'lunch' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id }) },
    )
    expect(moved.status).toBe(200)
    const body = (await moved.json()) as { date: string; slot: string }
    expect(body.date).toBe('2026-08-28')
    expect(body.slot).toBe('lunch')
  })

  it('PATCH con solo date (sin slot) es 400 validation', async () => {
    const rw = await makeToken(['plan:read', 'plan:write'])
    const created = await postEntries(
      req('/api/v1/plan/entries', rw, {
        method: 'POST',
        body: JSON.stringify({ add: [{ date: '2026-08-27', slot: 'dinner', customTitle: 'Pizza', servings: 2 }], remove: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { added } = (await created.json()) as { added: { id: string }[] }
    const id = added[0]!.id
    const res = await patchEntryRoute(
      req(`/api/v1/plan/entries/${id}`, rw, { method: 'PATCH', body: JSON.stringify({ date: '2026-08-28' }), headers: { 'content-type': 'application/json' } }),
      { params: Promise.resolve({ id }) },
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
  })

  it('DELETE /plan/entries/{id} borra la entrada; repetir es 404', async () => {
    const rw = await makeToken(['plan:read', 'plan:write'])
    const created = await postEntries(
      req('/api/v1/plan/entries', rw, {
        method: 'POST',
        body: JSON.stringify({ add: [{ date: '2026-08-27', slot: 'dinner', customTitle: 'Pizza', servings: 2 }], remove: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { added } = (await created.json()) as { added: { id: string }[] }
    const id = added[0]!.id
    expect((await deleteEntry(req(`/api/v1/plan/entries/${id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id }) })).status).toBe(204)
    expect((await deleteEntry(req(`/api/v1/plan/entries/${id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id }) })).status).toBe(404)
  })

  it('un token no puede aprobar una propuesta (la aprueba una persona)', async () => {
    const rw = await makeToken(['plan:read', 'plan:write'])
    const created = await postProposals(
      req('/api/v1/plan/proposals', rw, { method: 'POST', body: JSON.stringify({ add: [], remove: [] }), headers: { 'content-type': 'application/json' } }),
    )
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }
    const decided = await postDecision(
      req(`/api/v1/plan/proposals/${id}`, rw, { method: 'POST', body: JSON.stringify({ decision: 'approve' }), headers: { 'content-type': 'application/json' } }),
      { params: Promise.resolve({ id }) },
    )
    expect(decided.status).toBe(403)
  })

  it('GET /plan/proposals?status=pending lista solo las pendientes', async () => {
    const rw = await makeToken(['plan:read', 'plan:write'])
    await postProposals(req('/api/v1/plan/proposals', rw, { method: 'POST', body: JSON.stringify({ add: [], remove: [] }), headers: { 'content-type': 'application/json' } }))
    const res = await getProposals(req('/api/v1/plan/proposals?status=pending', rw))
    expect(res.status).toBe(200)
    const proposals = (await res.json()) as { status: string }[]
    expect(proposals.length).toBe(1)
    expect(proposals[0]!.status).toBe('pending')
  })

  it('un token de otro hogar recibe 404 al tocar una entrada ajena', async () => {
    const [otherHousehold] = await state.db.insert(schema.households).values({ name: 'Otra casa' }).returning()
    const [otherUser] = await state.db.insert(schema.users).values({ displayName: 'Bea' }).returning()
    await state.db.insert(schema.householdMembers).values({ householdId: otherHousehold!.id, userId: otherUser!.id, role: 'owner' })
    const [entry] = await state.db
      .insert(schema.mealPlanEntries)
      .values({ householdId: otherHousehold!.id, date: '2026-08-27', slot: 'dinner', customTitle: 'De otro hogar', servings: 1 })
      .returning({ id: schema.mealPlanEntries.id })

    const rw = await makeToken(['plan:read', 'plan:write'])
    const patched = await patchEntryRoute(
      req(`/api/v1/plan/entries/${entry!.id}`, rw, { method: 'PATCH', body: JSON.stringify({ servings: 4 }), headers: { 'content-type': 'application/json' } }),
      { params: Promise.resolve({ id: entry!.id }) },
    )
    expect(patched.status).toBe(404)

    const deleted = await deleteEntry(req(`/api/v1/plan/entries/${entry!.id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id: entry!.id }) })
    expect(deleted.status).toBe(404)
  })

  it('POST /plan/entries con recipeId de otro hogar es 400 validation', async () => {
    const [otherHousehold] = await state.db.insert(schema.households).values({ name: 'Otra casa' }).returning()
    const [recipe] = await state.db
      .insert(schema.recipes)
      .values({ householdId: otherHousehold!.id, title: 'Ajena', servingsBase: 2 })
      .returning({ id: schema.recipes.id })

    const rw = await makeToken(['plan:read', 'plan:write'])
    const res = await postEntries(
      req('/api/v1/plan/entries', rw, {
        method: 'POST',
        body: JSON.stringify({ add: [{ date: '2026-08-27', slot: 'dinner', recipeId: recipe!.id, servings: 2 }], remove: [] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(400)
  })
})
