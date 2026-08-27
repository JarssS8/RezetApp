import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { Ctx } from './ctx'
import { createMakeToken, req, type ApiTestState } from './api-test-helpers'

// Ver lib/services/api-recipes.test.ts: mismos motivos para los dos mocks.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

// Solo se sustituye pushToShopList (haría una llamada de red real); shopListDeepLink
// y ShopListError se quedan tal cual, igual que en lib/services/shopping.test.ts.
vi.mock('@/lib/integrations/shoplist', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/shoplist')>()
  return { ...actual, pushToShopList: vi.fn() }
})

import { ShopListError, pushToShopList } from '@/lib/integrations/shoplist'
import { POST as postGenerate } from '@/app/api/v1/shopping/generate/route'
import { POST as postPush } from '@/app/api/v1/shopping/push/route'
import { updateShoplistSettings } from './shoplist-settings'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

const state: ApiTestState = { db: undefined as unknown as TestDb, householdId: '', userId: '' }
const makeToken = createMakeToken(state)
const ownerCtx = (): Ctx => ({ db: state.db, householdId: state.householdId, userId: state.userId, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] })

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
  vi.mocked(pushToShopList).mockReset()
})
afterEach(() => {
  delete process.env.SHOPLIST_FN_URL
  delete process.env.SHOPLIST_IMPORT_SECRET
  delete process.env.SHOPLIST_LIST_TOKEN
})

async function makeRecipe(title: string, servingsBase: number): Promise<string> {
  const [r] = await state.db.insert(schema.recipes).values({ householdId: state.householdId, title, servingsBase }).returning()
  return r!.id
}
async function makeFood(nameEs: string, nameEn: string): Promise<string> {
  const [f] = await state.db.insert(schema.foods).values({ nameEs, nameEn, searchNameEs: nameEs.toLowerCase(), searchNameEn: nameEn.toLowerCase(), defaultUnit: 'g' }).returning()
  return f!.id
}

describe('POST /api/v1/shopping/generate', () => {
  it('consolida el plan (escalado) contra la despensa, con los dos scopes de lectura', async () => {
    const recipe = await makeRecipe('Guiso de lentejas', 4)
    const lentejas = await makeFood('Lentejas', 'Lentils')
    await state.db
      .insert(schema.recipeIngredients)
      .values({ recipeId: recipe, foodId: lentejas, rawText: '400 g de lentejas', quantity: 400, unit: 'g', scalesLinearly: true, sortOrder: 0 })
    await state.db.insert(schema.mealPlanEntries).values({ householdId: state.householdId, date: '2026-09-01', slot: 'lunch', recipeId: recipe, servings: 2 })
    await state.db.insert(schema.pantryItems).values({ householdId: state.householdId, foodId: lentejas, quantity: 100, unit: 'g' })

    const t = await makeToken(['plan:read', 'pantry:read'])
    const res = await postGenerate(
      req('/api/v1/shopping/generate', t, { method: 'POST', body: JSON.stringify({ from: '2026-09-01', to: '2026-09-01' }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { from: string; to: string; lines: { name: string; quantity: number | null }[] }
    expect(body.from).toBe('2026-09-01')
    expect(body.lines).toEqual([{ foodId: lentejas, name: 'Lentejas', quantity: 100, unit: 'g', unresolved: false, pantryUnmatched: false }])
  })

  it('con un solo scope de los dos exigidos es 403', async () => {
    const t = await makeToken(['plan:read'])
    const res = await postGenerate(
      req('/api/v1/shopping/generate', t, { method: 'POST', body: JSON.stringify({ from: '2026-09-01', to: '2026-09-01' }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(403)
  })

  it('un rango de más de 92 días es 400', async () => {
    const t = await makeToken(['plan:read', 'pantry:read'])
    const res = await postGenerate(
      req('/api/v1/shopping/generate', t, { method: 'POST', body: JSON.stringify({ from: '2026-01-01', to: '2026-12-31' }), headers: { 'content-type': 'application/json' } }),
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/shopping/push', () => {
  it('sin ShopList configurado es 400 validation, no un fallo de red', async () => {
    const t = await makeToken(['shopping:push'])
    const res = await postPush(
      req('/api/v1/shopping/push', t, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ foodId: null, name: 'sal', quantity: null, unit: null, unresolved: true, pantryUnmatched: false }] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation')
    expect(pushToShopList).not.toHaveBeenCalled()
  })

  it('con config de hogar: inserta y devuelve el enlace', async () => {
    await updateShoplistSettings(ownerCtx(), { fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc' })
    vi.mocked(pushToShopList).mockResolvedValueOnce({ inserted: 1, batches: 1 })

    const t = await makeToken(['shopping:push'])
    const res = await postPush(
      req('/api/v1/shopping/push', t, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ foodId: null, name: 'Huevos', quantity: 6, unit: 'ud', unresolved: false, pantryUnmatched: false }] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inserted: 1, deepLink: 'https://shop.jarsss8.es/#/s/lst_abc' })
  })

  it('un fallo de ShopList se traduce a 502 con el código shoplist, sin filtrar el secreto', async () => {
    await updateShoplistSettings(ownerCtx(), { fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc' })
    vi.mocked(pushToShopList).mockRejectedValueOnce(new ShopListError(503, 'Service Unavailable'))

    const t = await makeToken(['shopping:push'])
    const res = await postPush(
      req('/api/v1/shopping/push', t, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ foodId: null, name: 'Huevos', quantity: 6, unit: 'ud', unresolved: false, pantryUnmatched: false }] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('shoplist')
    expect(body.error.message).not.toContain('topsecret')
  })

  it('sin shopping:push es 403', async () => {
    const t = await makeToken(['plan:read'])
    const res = await postPush(
      req('/api/v1/shopping/push', t, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ foodId: null, name: 'Huevos', quantity: 6, unit: 'ud', unresolved: false, pantryUnmatched: false }] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('un cuerpo mal formado (lines vacío) es 400', async () => {
    const t = await makeToken(['shopping:push'])
    const res = await postPush(req('/api/v1/shopping/push', t, { method: 'POST', body: JSON.stringify({ lines: [] }), headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(400)
  })
})
