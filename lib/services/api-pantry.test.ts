import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { GET as getFoods } from '@/app/api/v1/foods/search/route'
import { GET as getBarcode } from '@/app/api/v1/pantry/barcode/[code]/route'
import { POST as postAdjust } from '@/app/api/v1/pantry/adjust/route'
import { DELETE as deletePantry } from '@/app/api/v1/pantry/[id]/route'
import { GET as getPantry, POST as postPantry } from '@/app/api/v1/pantry/route'
import { createMakeToken, req, type ApiTestState } from './api-test-helpers'

// Ver lib/services/api-recipes.test.ts: mismos motivos para los dos mocks.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

const state: ApiTestState = { db: undefined as unknown as TestDb, householdId: '', userId: '' }
const makeToken = createMakeToken(state)
let onionId = ''

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
  const [f] = await state.db
    .insert(schema.foods)
    .values({ nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda', kcal100g: 40 })
    .returning()
  onionId = f!.id
})

describe('/api/v1/pantry', () => {
  it('alta, listado, ajuste sin bajar de 0 y borrado', async () => {
    const rw = await makeToken(['pantry:read', 'pantry:write'])
    const created = await postPantry(
      req('/api/v1/pantry', rw, {
        method: 'POST',
        body: JSON.stringify({ foodId: onionId, quantity: 100, unit: 'g', location: 'pantry' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const listed = await getPantry(req('/api/v1/pantry', rw))
    expect(listed.status).toBe(200)
    const rows = (await listed.json()) as { id: string; quantity: number }[]
    expect(rows.map((r) => r.id)).toEqual([id])

    const adjusted = await postAdjust(
      req('/api/v1/pantry/adjust', rw, { method: 'POST', body: JSON.stringify({ itemId: id, delta: -500 }), headers: { 'content-type': 'application/json' } }),
    )
    expect(adjusted.status).toBe(200)
    expect((await adjusted.json()).quantity).toBe(0)

    const deleted = await deletePantry(req(`/api/v1/pantry/${id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
    expect(deleted.status).toBe(204)
    const deletedAgain = await deletePantry(req(`/api/v1/pantry/${id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
    expect(deletedAgain.status).toBe(404)
  })

  it('un itemId de otro hogar da 404 en adjust y en delete', async () => {
    const [otherHousehold] = await state.db.insert(schema.households).values({ name: 'Otra casa' }).returning()
    const [item] = await state.db
      .insert(schema.pantryItems)
      .values({ householdId: otherHousehold!.id, foodId: onionId, quantity: 10, unit: 'g', location: 'pantry' })
      .returning({ id: schema.pantryItems.id })

    const rw = await makeToken(['pantry:read', 'pantry:write'])
    const adjusted = await postAdjust(
      req('/api/v1/pantry/adjust', rw, {
        method: 'POST',
        body: JSON.stringify({ itemId: item!.id, delta: -1 }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(adjusted.status).toBe(404)

    const deleted = await deletePantry(req(`/api/v1/pantry/${item!.id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id: item!.id }) })
    expect(deleted.status).toBe(404)
  })

  it('un id con forma inválida en la ruta es 404, no 500', async () => {
    const rw = await makeToken(['pantry:write'])
    const deleted = await deletePantry(req('/api/v1/pantry/no-es-un-uuid', rw, { method: 'DELETE' }), { params: Promise.resolve({ id: 'no-es-un-uuid' }) })
    expect(deleted.status).toBe(404)
  })

  it('GET /pantry/barcode/000 es 400: el código no cumple BarcodeSchema', async () => {
    const ro = await makeToken(['pantry:read'])
    const res = await getBarcode(req('/api/v1/pantry/barcode/000', ro), { params: Promise.resolve({ code: '000' }) })
    expect(res.status).toBe(400)
  })

  it('GET /pantry/barcode/{code} con un alimento ya catalogado es 200 sin salir a la red', async () => {
    const barcode = '5012345678900'
    await state.db.insert(schema.foods).values({ nameEs: 'leche', nameEn: 'milk', searchNameEs: 'leche', searchNameEn: 'milk', source: 'usda', barcode })
    const ro = await makeToken(['pantry:read'])
    const res = await getBarcode(req(`/api/v1/pantry/barcode/${barcode}`, ro), { params: Promise.resolve({ code: barcode }) })
    expect(res.status).toBe(200)
    expect((await res.json()).nameEs).toBe('leche')
  })

  it('POST /pantry sin pantry:write es 403', async () => {
    const ro = await makeToken(['pantry:read'])
    const res = await postPantry(
      req('/api/v1/pantry', ro, {
        method: 'POST',
        body: JSON.stringify({ foodId: onionId, quantity: 100, unit: 'g', location: 'pantry' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('POST /pantry con un cuerpo mal formado es 400', async () => {
    const rw = await makeToken(['pantry:write'])
    const res = await postPantry(
      req('/api/v1/pantry', rw, { method: 'POST', body: JSON.stringify({ foodId: onionId, quantity: -1, unit: 'g' }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(400)
  })
})

describe('/api/v1/foods/search', () => {
  it('acepta cualquiera de los dos scopes y rechaza el resto', async () => {
    for (const scopes of [['pantry:read'], ['recipes:read']]) {
      const t = await makeToken(scopes)
      expect((await getFoods(req('/api/v1/foods/search?q=cebolla', t))).status).toBe(200)
    }
    const otro = await makeToken(['plan:read'])
    expect((await getFoods(req('/api/v1/foods/search?q=cebolla', otro))).status).toBe(403)
  })
})
