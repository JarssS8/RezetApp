import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { getFood, getFoodsNutrition, resolveFoodName, resolveMany, searchFoods } from './foods'

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
