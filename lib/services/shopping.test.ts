import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { decryptSecret, getKeys } from '@/lib/crypto'
import type { ShoppingLine } from '@/lib/domain'
import type { Ctx } from './ctx'

// Solo se sustituye pushToShopList (haría una llamada de red real); shopListDeepLink
// y ShopListError se quedan tal cual para probar la orquestación completa del servicio.
vi.mock('@/lib/integrations/shoplist', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/shoplist')>()
  return { ...actual, pushToShopList: vi.fn() }
})

import { pushToShopList } from '@/lib/integrations/shoplist'
import { generateShopping, pushShopping } from './shopping'
import { getShoplistSettings, updateShoplistSettings } from './shoplist-settings'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

let db: TestDb
const ctxOf = (householdId: string, overrides: Partial<Ctx> = {}): Ctx => ({
  db,
  householdId,
  userId: 'u1',
  apiTokenId: null,
  role: 'owner',
  locale: 'es',
  scopes: [],
  ...overrides,
})

async function makeHousehold(name: string): Promise<string> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  if (!h) throw new Error('seed')
  return h.id
}

async function makeRecipe(householdId: string, title: string, servingsBase: number): Promise<string> {
  const [r] = await db.insert(schema.recipes).values({ householdId, title, servingsBase }).returning()
  if (!r) throw new Error('seed')
  return r.id
}

async function makeFood(nameEs: string, nameEn: string): Promise<string> {
  const [f] = await db.insert(schema.foods).values({ nameEs, nameEn, searchNameEs: nameEs.toLowerCase(), searchNameEn: nameEn.toLowerCase(), defaultUnit: 'g' }).returning()
  if (!f) throw new Error('seed')
  return f.id
}

const shopLine = (over: Partial<ShoppingLine> = {}): ShoppingLine => ({
  foodId: null,
  name: 'Alimento',
  quantity: 1,
  unit: 'ud',
  unresolved: false,
  pantryUnmatched: false,
  ...over,
})

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  vi.mocked(pushToShopList).mockReset()
})
afterEach(() => {
  delete process.env.SHOPLIST_FN_URL
  delete process.env.SHOPLIST_IMPORT_SECRET
  delete process.env.SHOPLIST_LIST_TOKEN
})

describe('generateShopping', () => {
  it('consolida el plan (escalado) contra la despensa y excluye lo cocinado', async () => {
    const a = await makeHousehold('Casa A')
    const recipe = await makeRecipe(a, 'Guiso de lentejas', 4)
    const lentejas = await makeFood('Lentejas', 'Lentils')
    await db.insert(schema.recipeIngredients).values({ recipeId: recipe, foodId: lentejas, rawText: '400 g de lentejas', quantity: 400, unit: 'g', scalesLinearly: true, sortOrder: 0 })
    // 2 raciones sobre una base de 4 con 400 g → 200 g necesarios
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipe, servings: 2 })
    // cocinada: no debe entrar en la consolidación
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'dinner', recipeId: recipe, servings: 2, cookedAt: new Date() })
    await db.insert(schema.pantryItems).values({ householdId: a, foodId: lentejas, quantity: 100, unit: 'g' })

    const result = await generateShopping(ctxOf(a), { from: '2026-09-01', to: '2026-09-01' })
    expect(result.from).toBe('2026-09-01')
    expect(result.to).toBe('2026-09-01')
    expect(result.lines).toEqual([{ foodId: lentejas, name: 'Lentejas', quantity: 100, unit: 'g', unresolved: false, pantryUnmatched: false }])
  })
})

describe('pushShopping', () => {
  it('sin configuración (ni hogar ni entorno) lanza validation y no llama a ShopList', async () => {
    const a = await makeHousehold('Casa A')
    await expect(pushShopping(ctxOf(a), [shopLine()])).rejects.toMatchObject({ code: 'validation' })
    expect(pushToShopList).not.toHaveBeenCalled()
  })

  it('con config de hogar: inserta, arma el enlace y actualiza shoplist_last_pushed_at', async () => {
    const a = await makeHousehold('Casa A')
    const ctx = ctxOf(a)
    await updateShoplistSettings(ctx, { fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc' })
    vi.mocked(pushToShopList).mockResolvedValueOnce({ inserted: 3, batches: 1 })

    const lines = [shopLine({ name: 'Huevos' })]
    const result = await pushShopping(ctx, lines)
    expect(result).toEqual({ inserted: 3, deepLink: 'https://shop.jarsss8.es/#/s/lst_abc' })
    expect(pushToShopList).toHaveBeenCalledWith({ fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc' }, lines)

    const [h] = await db.select().from(schema.households).where(eq(schema.households.id, a))
    expect(h?.shoplistLastPushedAt).not.toBeNull()
  })

  it('sin config de hogar recurre a las variables de entorno', async () => {
    process.env.SHOPLIST_FN_URL = 'https://env.example/functions/v1'
    process.env.SHOPLIST_IMPORT_SECRET = 'env-secret'
    process.env.SHOPLIST_LIST_TOKEN = 'lst_env'
    const a = await makeHousehold('Casa A')
    vi.mocked(pushToShopList).mockResolvedValueOnce({ inserted: 1, batches: 1 })

    const result = await pushShopping(ctxOf(a), [shopLine()])
    expect(result.deepLink).toBe('https://shop.jarsss8.es/#/s/lst_env')
    expect(pushToShopList).toHaveBeenCalledWith({ fnUrl: 'https://env.example/functions/v1', secret: 'env-secret', listToken: 'lst_env' }, [shopLine()])
  })
})

describe('ajustes de ShopList', () => {
  it('cifra el secreto, no lo guarda en claro y getShoplistSettings nunca lo devuelve', async () => {
    const a = await makeHousehold('Casa A')
    const ctx = ctxOf(a)
    await updateShoplistSettings(ctx, { fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc' })

    const [h] = await db.select().from(schema.households).where(eq(schema.households.id, a))
    expect(h?.shoplistSecretEnc).not.toBeNull()
    expect(h?.shoplistSecretEnc?.toString('utf8')).not.toContain('topsecret')
    expect(decryptSecret(h!.shoplistSecretEnc!, getKeys().secrets)).toBe('topsecret')

    const settings = await getShoplistSettings(ctx)
    expect(settings).toMatchObject({ fnUrl: 'https://edge.example/functions/v1', listToken: 'lst_abc', hasSecret: true, source: 'household' })
    expect(JSON.stringify(settings)).not.toContain('topsecret')
  })

  it("secret '' mantiene el guardado; null lo borra", async () => {
    const a = await makeHousehold('Casa A')
    const ctx = ctxOf(a)
    await updateShoplistSettings(ctx, { fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc' })
    await updateShoplistSettings(ctx, { fnUrl: 'https://edge.example/functions/v1', secret: '', listToken: 'lst_abc' })
    let [h] = await db.select().from(schema.households).where(eq(schema.households.id, a))
    expect(decryptSecret(h!.shoplistSecretEnc!, getKeys().secrets)).toBe('topsecret')

    await updateShoplistSettings(ctx, { fnUrl: 'https://edge.example/functions/v1', secret: null, listToken: 'lst_abc' })
    ;[h] = await db.select().from(schema.households).where(eq(schema.households.id, a))
    expect(h?.shoplistSecretEnc).toBeNull()
    const settings = await getShoplistSettings(ctx)
    expect(settings.source).toBe('none')
  })

  it('un member no puede cambiar los ajustes de ShopList', async () => {
    const a = await makeHousehold('Casa A')
    await expect(updateShoplistSettings(ctxOf(a, { role: 'member' }), { fnUrl: null, secret: null, listToken: null })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('sin nada configurado, source es none y lastPushedAt es null', async () => {
    const a = await makeHousehold('Casa A')
    const settings = await getShoplistSettings(ctxOf(a))
    expect(settings).toEqual({ fnUrl: null, listToken: null, hasSecret: false, source: 'none', lastPushedAt: null })
  })
})
