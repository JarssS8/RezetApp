import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { adjustPantryItem, expiringPantry, listPantry, pantryAsDomain, removePantryItem, upsertPantryItem } from './pantry'

let db: TestDb, ctxA: Ctx, ctxB: Ctx, onion: string
async function makeHousehold(name: string): Promise<Ctx> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('setup')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
}
beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  ctxA = await makeHousehold('A')
  ctxB = await makeHousehold('B')
  const [f] = await db.insert(schema.foods).values({ nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda', kcal100g: 40 }).returning()
  onion = f!.id
})

describe('pantry', () => {
  it('upsert crea y actualiza; list ordena por ubicación y caducidad; aislamiento', async () => {
    const a = await upsertPantryItem(ctxA, { foodId: onion, quantity: 500, unit: 'g', location: 'fridge', expiresAt: '2026-09-01' })
    await upsertPantryItem(ctxA, { foodId: onion, quantity: 200, unit: 'g', location: 'pantry' })
    const again = await upsertPantryItem(ctxA, { id: a.id, foodId: onion, quantity: 450, unit: 'g', location: 'fridge', expiresAt: '2026-09-01' })
    expect(again.id).toBe(a.id)
    const rows = await listPantry(ctxA, {})
    expect(rows.map((r) => [r.location, r.quantity])).toEqual([
      ['fridge', 450],
      ['pantry', 200],
    ])
    expect(await listPantry(ctxB, {})).toEqual([])
    await expect(upsertPantryItem(ctxB, { id: a.id, foodId: onion, quantity: 1, unit: 'g', location: 'fridge' })).rejects.toMatchObject({ code: 'not_found' })
  })
  it('adjust es atómico y nunca baja de 0', async () => {
    const a = await upsertPantryItem(ctxA, { foodId: onion, quantity: 100, unit: 'g', location: 'pantry' })
    expect((await adjustPantryItem(ctxA, { itemId: a.id, delta: -30 })).quantity).toBe(70)
    expect((await adjustPantryItem(ctxA, { itemId: a.id, delta: -500 })).quantity).toBe(0)
    await expect(adjustPantryItem(ctxB, { itemId: a.id, delta: -1 })).rejects.toMatchObject({ code: 'not_found' })
    const results = await Promise.all(Array.from({ length: 10 }, () => adjustPantryItem(ctxA, { itemId: a.id, delta: 5 })))
    expect(Math.max(...results.map((r) => r.quantity))).toBe(50)
  })
  it('expiring devuelve lo que caduca en N días con daysToExpiry, y filtros de list', async () => {
    const today = new Date('2026-08-26T00:00:00Z')
    await upsertPantryItem(ctxA, { foodId: onion, quantity: 1, unit: 'ud', location: 'fridge', expiresAt: '2026-08-28' })
    await upsertPantryItem(ctxA, { foodId: onion, quantity: 1, unit: 'ud', location: 'freezer', expiresAt: '2026-10-01' })
    const exp = await expiringPantry(ctxA, 3, today)
    expect(exp.map((r) => r.daysToExpiry)).toEqual([2])
    expect((await listPantry(ctxA, { location: 'freezer' })).length).toBe(1)
    expect((await listPantry(ctxA, { expiresBefore: '2026-09-01' })).length).toBe(1)
    expect((await listPantry(ctxA, { q: 'cebo' })).length).toBe(2)
  })
  it('remove y pantryAsDomain', async () => {
    const a = await upsertPantryItem(ctxA, { foodId: onion, quantity: 10, unit: 'g', location: 'pantry' })
    expect((await pantryAsDomain(ctxA))[0]).toMatchObject({ id: a.id, foodId: onion, quantity: 10, unit: 'g', expiresAt: null })
    await removePantryItem(ctxA, a.id)
    expect(await listPantry(ctxA, {})).toEqual([])
    await expect(removePantryItem(ctxB, a.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})
