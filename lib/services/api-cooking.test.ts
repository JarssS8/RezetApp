import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { createMakeToken, req, type ApiTestState } from './api-test-helpers'
import { upsertPantryItem } from './pantry'

// Ver lib/services/api-recipes.test.ts: mismos motivos para los dos mocks.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

import { POST as postLog } from '@/app/api/v1/cooking/log/route'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

const state: ApiTestState = { db: undefined as unknown as TestDb, householdId: '', userId: '' }
const makeToken = createMakeToken(state)

let onionId: string
let recipeId: string
let entryId: string

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

  const [onion] = await state.db
    .insert(schema.foods)
    .values({ nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda', kcal100g: 40, defaultUnit: 'g' })
    .returning()
  onionId = onion!.id

  // 2 raciones base, 300 g de cebolla: cocinar 4 raciones pide 600 g
  const [recipe] = await state.db.insert(schema.recipes).values({ householdId: state.householdId, title: 'Sopa de cebolla', servingsBase: 2 }).returning()
  recipeId = recipe!.id
  await state.db
    .insert(schema.recipeIngredients)
    .values({ recipeId, foodId: onionId, rawText: '300 g de cebolla', quantity: 300, unit: 'g', scalesLinearly: true, sortOrder: 0 })

  await upsertPantryItem(
    { db: state.db, householdId: state.householdId, userId: state.userId, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] },
    { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' },
  )

  const [entry] = await state.db
    .insert(schema.mealPlanEntries)
    .values({ householdId: state.householdId, date: '2026-08-27', slot: 'dinner', recipeId, servings: 4 })
    .returning({ id: schema.mealPlanEntries.id })
  entryId = entry!.id
})

describe('POST /api/v1/cooking/log', () => {
  it('descuenta la despensa y devuelve el resultado', async () => {
    const t = await makeToken(['cooking:write'])
    const res = await postLog(
      req('/api/v1/cooking/log', t, { method: 'POST', body: JSON.stringify({ entryId, servingsCooked: 2 }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { entryId: string; deductions: { deducted: number }[] }
    expect(body.entryId).toBe(entryId)
    expect(body.deductions[0]?.deducted).toBe(300)
  })

  it('registrar dos veces la misma entrada es 409', async () => {
    const t = await makeToken(['cooking:write'])
    const body = JSON.stringify({ entryId, servingsCooked: 2 })
    await postLog(req('/api/v1/cooking/log', t, { method: 'POST', body, headers: { 'content-type': 'application/json' } }))
    const res = await postLog(req('/api/v1/cooking/log', t, { method: 'POST', body, headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(409)
  })

  it('sin cooking:write es 403', async () => {
    const t = await makeToken(['plan:write', 'pantry:write'])
    const res = await postLog(
      req('/api/v1/cooking/log', t, { method: 'POST', body: JSON.stringify({ entryId, servingsCooked: 2 }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(403)
  })

  it('un cuerpo mal formado (sin entryId ni recipeId) es 400', async () => {
    const t = await makeToken(['cooking:write'])
    const res = await postLog(req('/api/v1/cooking/log', t, { method: 'POST', body: JSON.stringify({ servingsCooked: 2 }), headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(400)
  })

  it('una entrada de otro hogar es 404', async () => {
    const [otherHousehold] = await state.db.insert(schema.households).values({ name: 'Otra casa' }).returning()
    const [foreignEntry] = await state.db
      .insert(schema.mealPlanEntries)
      .values({ householdId: otherHousehold!.id, date: '2026-08-27', slot: 'dinner', recipeId, servings: 2 })
      .returning({ id: schema.mealPlanEntries.id })

    const t = await makeToken(['cooking:write'])
    const res = await postLog(
      req('/api/v1/cooking/log', t, { method: 'POST', body: JSON.stringify({ entryId: foreignEntry!.id, servingsCooked: 2 }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(404)
  })
})
