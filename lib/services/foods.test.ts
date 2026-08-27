import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { OffProduct } from '@/lib/integrations/open-food-facts'
import type { Ctx } from '@/lib/services/ctx'
import { correctFood, createFood, getFood, getFoodsNutrition, lookupBarcode, resolveFoodName, resolveMany, searchFoods } from './foods'

let db: TestDb
let ctxA: Ctx
let ctxB: Ctx

async function makeHousehold(name: string): Promise<Ctx> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('setup')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
}

async function seedGlobal(nameEs: string, nameEn: string, extra: Partial<typeof schema.foods.$inferInsert> = {}) {
  const [f] = await db
    .insert(schema.foods)
    .values({ nameEs, nameEn, searchNameEs: nameEs.toLowerCase(), searchNameEn: nameEn.toLowerCase(), source: 'usda', kcal100g: 40, ...extra })
    .returning()
  return f!
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  ctxA = await makeHousehold('A')
  ctxB = await makeHousehold('B')
  await seedGlobal('cebolla', 'onion', { aliases: ['cebolla blanca'] })
  await seedGlobal('cebolla morada', 'red onion')
  await seedGlobal('pimiento rojo', 'red pepper')
})

describe('searchFoods', () => {
  it('busca por trigram en el idioma del contexto y devuelve el nombre en ese idioma', async () => {
    const r = await searchFoods(ctxA, { q: 'cebol' })
    expect(r.map((f) => f.name)).toEqual(['cebolla', 'cebolla morada'])
    const en = await searchFoods({ ...ctxA, locale: 'en' }, { q: 'onio' })
    expect(en[0]?.name).toBe('onion')
  })
  it('prefiere el alimento del hogar cuando hay uno con el mismo nombre y no muestra los de otros hogares', async () => {
    await db.insert(schema.foods).values({ householdId: ctxA.householdId, nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'manual', kcal100g: 38 })
    const a = await searchFoods(ctxA, { q: 'cebolla' })
    expect(a[0]?.householdId).toBe(ctxA.householdId)
    const b = await searchFoods(ctxB, { q: 'cebolla' })
    expect(b.every((f) => f.householdId === null)).toBe(true)
  })
  it('W2-R6: el alimento del hogar oculta al global homónimo (dos filas en la tabla, una en el resultado)', async () => {
    await db.insert(schema.foods).values({ householdId: ctxA.householdId, nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'manual', kcal100g: 38 })
    const a = await searchFoods(ctxA, { q: 'cebolla' })
    // 'cebolla morada' sigue apareciendo (nombre distinto); solo el global homónimo 'cebolla' se oculta
    const named = a.filter((f) => f.name === 'cebolla')
    expect(named).toHaveLength(1)
    expect(named[0]?.householdId).toBe(ctxA.householdId)
  })
})

describe('resolveFoodName', () => {
  it('exacto por nombre normalizado', async () => {
    const r = await resolveFoodName(ctxA, 'Cebolla', 'es')
    expect(r?.method).toBe('exact')
  })
  it('por alias', async () => {
    const r = await resolveFoodName(ctxA, 'cebolla blanca', 'es')
    expect(r?.method).toBe('alias')
    expect(r?.name).toBe('cebolla')
  })
  it('por trigram ≥ 0.6, y null por debajo', async () => {
    expect((await resolveFoodName(ctxA, 'pimientos rojos', 'es'))?.method).toBe('trigram')
    expect(await resolveFoodName(ctxA, 'zzzz', 'es')).toBeNull()
  })
  it('resolveMany conserva el orden y los nulls', async () => {
    const r = await resolveMany(ctxA, ['cebolla', 'nada', 'pimiento rojo'], 'es')
    expect(r.map((x) => x?.name ?? null)).toEqual(['cebolla', null, 'pimiento rojo'])
  })
  it('exacto y trigram cruzan de idioma: busca en search_name_es y search_name_en a la vez', async () => {
    const exact = await resolveFoodName(ctxA, 'onion', 'es')
    expect(exact?.method).toBe('exact')
    expect(exact?.name).toBe('cebolla') // devuelve el nombre en el idioma pedido (es), aunque haya matcheado por en
    const tri = await resolveFoodName(ctxA, 'onions', 'es')
    expect(tri?.method).toBe('trigram')
    expect(tri?.name).toBe('cebolla')
  })
})

describe('getFoodsNutrition / getFood', () => {
  it('devuelve un mapa por id con conversión y nutrición', async () => {
    const [f] = await searchFoods(ctxA, { q: 'cebolla morada' })
    const m = await getFoodsNutrition(ctxA, [f!.id])
    expect(m.get(f!.id)?.kcal100g).toBe(40)
    expect(await getFood(ctxB, f!.id)).not.toBeNull() // global: visible para todos
  })
  it('un alimento privado de A no es visible para B', async () => {
    const [p] = await db.insert(schema.foods).values({ householdId: ctxA.householdId, nameEs: 'secreto', nameEn: 'secret', searchNameEs: 'secreto', searchNameEn: 'secret' }).returning()
    expect(await getFood(ctxB, p!.id)).toBeNull()
    expect((await getFoodsNutrition(ctxB, [p!.id])).size).toBe(0)
  })
})

describe('createFood / correctFood', () => {
  it('createFood crea un alimento del hogar con nombres y aliases normalizados', async () => {
    const f = await createFood(ctxA, { nameEs: 'Tomate Pera', nameEn: 'Plum Tomato', aliases: ['Tomate de pera'], defaultUnit: 'g', allergens: [], seasonalMonths: [7, 8] })
    expect(f.householdId).toBe(ctxA.householdId)
    expect(f.source).toBe('manual')
    expect((await resolveFoodName(ctxA, 'tomate de pera', 'es'))?.foodId).toBe(f.id)
    // aislamiento: el hogar B no resuelve el alimento privado de A
    expect(await resolveFoodName(ctxB, 'tomate pera', 'es')).toBeNull()
  })

  it('correctFood sobre un alimento global crea una copia del hogar; el global sigue intacto', async () => {
    const [g] = await searchFoods(ctxA, { q: 'pimiento rojo' })
    const c = await correctFood(ctxA, g!.id, { kcal100g: 31 })
    expect(c.id).not.toBe(g!.id)
    expect(c.householdId).toBe(ctxA.householdId)
    expect(c.kcal100g).toBe(31)
    expect(c.source).toBe('manual')
    // el global sigue intacto y el hogar A ahora resuelve a su copia
    expect((await getFood(ctxB, g!.id))?.kcal100g).toBe(40)
    expect((await resolveFoodName(ctxA, 'pimiento rojo', 'es'))?.foodId).toBe(c.id)
  })

  it('corregir el mismo global dos veces reutiliza la copia del hogar en vez de duplicarla', async () => {
    const [g] = await searchFoods(ctxA, { q: 'pimiento rojo' })
    const first = await correctFood(ctxA, g!.id, { kcal100g: 31 })
    const second = await correctFood(ctxA, g!.id, { kcal100g: 33 })
    expect(second.id).toBe(first.id)
    expect(second.kcal100g).toBe(33)
    const copies = await db
      .select()
      .from(schema.foods)
      .where(and(eq(schema.foods.householdId, ctxA.householdId), eq(schema.foods.searchNameEs, 'pimiento rojo')))
    expect(copies).toHaveLength(1)
  })

  it('correctFood sobre un alimento propio actualiza in situ; sobre uno ajeno → not_found', async () => {
    const f = await createFood(ctxA, { nameEs: 'x', nameEn: 'x', aliases: [], defaultUnit: 'g', allergens: [], seasonalMonths: [] })
    const c = await correctFood(ctxA, f.id, { kcal100g: 5 })
    expect(c.id).toBe(f.id)
    expect(c.source).toBe('manual')
    await expect(correctFood(ctxB, f.id, { kcal100g: 5 })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('lookupBarcode', () => {
  it('devuelve el alimento local si ya existe con ese código, sin llamar al fetcher', async () => {
    await seedGlobal('galleta', 'biscuit', { barcode: '12345678' })
    const fetcher = vi.fn(async () => null)
    const food = await lookupBarcode(ctxA, '12345678', fetcher)
    expect(food?.nameEs).toBe('galleta')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('consulta OFF si no existe y crea un alimento del hogar con source off', async () => {
    const fetcher = async (): Promise<OffProduct> => ({
      code: '99900000', name: 'Yogur', nameEs: 'Yogur natural', nameEn: 'Plain yogurt',
      kcal100g: 60, protein100g: 3.5, carbs100g: 4.5, fat100g: 3, fiber100g: 0,
      allergens: ['lactose'], aliases: [], gramsPerUnit: null,
    })
    const food = await lookupBarcode(ctxA, '99900000', fetcher)
    expect(food?.source).toBe('off')
    expect(food?.householdId).toBe(ctxA.householdId)
    // segunda vez para el mismo hogar: ya está en caché local, no vuelve a llamar a OFF
    const fetcher2 = vi.fn(async () => null)
    const again = await lookupBarcode(ctxA, '99900000', fetcher2)
    expect(again?.id).toBe(food?.id)
    expect(fetcher2).not.toHaveBeenCalled()
  })

  it('devuelve null si OFF no lo conoce', async () => {
    expect(await lookupBarcode(ctxA, '00000000', async () => null)).toBeNull()
  })

  it('lanza validation si el código de barras no tiene formato válido', async () => {
    await expect(lookupBarcode(ctxA, 'no-es-un-codigo', async () => null)).rejects.toMatchObject({ code: 'validation' })
  })
})
