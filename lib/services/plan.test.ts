import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from './ctx'
import { applyBatch, createLeftover, listEntries, moveEntry, patchEntry, rangeNutrition } from './plan'

let db: TestDb
const ctxOf = (householdId: string): Ctx => ({ db, householdId, userId: 'u1', apiTokenId: null, role: 'owner', locale: 'es', scopes: [] })

async function makeHousehold(name: string): Promise<string> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  if (!h) throw new Error('seed')
  return h.id
}

async function makeRecipe(householdId: string, title: string): Promise<string> {
  const [r] = await db
    .insert(schema.recipes)
    .values({
      householdId,
      title,
      kcalPerServing: 400,
      proteinPerServing: 20,
      carbsPerServing: 40,
      fatPerServing: 15,
      fiberPerServing: 5,
      servingsBase: 2,
      prepMinutes: 10,
      cookMinutes: 20,
    })
    .returning()
  if (!r) throw new Error('seed')
  return r.id
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
})

describe('applyBatch', () => {
  it('añade entradas, ignora quitar de otro hogar y valida que la receta pertenezca al hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const recipeB = await makeRecipe(b, 'Tortilla')
    const [foreignEntry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: b, date: '2026-09-01', slot: 'lunch', recipeId: recipeB, servings: 2 })
      .returning()
    if (!foreignEntry) throw new Error('seed')
    const [ownEntry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: a, date: '2026-09-01', slot: 'dinner', recipeId: recipeA, servings: 2 })
      .returning()
    if (!ownEntry) throw new Error('seed')

    const result = await applyBatch(ctxOf(a), {
      add: [
        { date: '2026-09-02', slot: 'lunch', recipeId: recipeA, servings: 2 },
        { date: '2026-09-03', slot: 'dinner', recipeId: recipeA, servings: 4 },
      ],
      remove: [ownEntry.id, foreignEntry.id],
    })

    expect(result.added).toHaveLength(2)
    expect(result.added.map((e) => e.title)).toEqual(['Lentejas', 'Lentejas'])
    expect(result.removed).toEqual([ownEntry.id])
    // La entrada del otro hogar sigue intacta
    const stillThere = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, foreignEntry.id))
    expect(stillThere).toHaveLength(1)

    await expect(applyBatch(ctxOf(a), { add: [{ date: '2026-09-04', slot: 'lunch', recipeId: recipeB, servings: 1 }], remove: [] })).rejects.toThrow()
  })

  it('permite customTitle sin receta', async () => {
    const a = await makeHousehold('Casa A')
    const result = await applyBatch(ctxOf(a), { add: [{ date: '2026-09-05', slot: 'snack', customTitle: 'Fruta libre', servings: 1 }], remove: [] })
    expect(result.added).toHaveLength(1)
    expect(result.added[0]?.title).toBe('Fruta libre')
    expect(result.added[0]?.recipeId).toBeNull()
  })
})

describe('listEntries', () => {
  it('filtra por rango y hogar, y calcula el estado derivado', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2, cookedAt: new Date() })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-10', slot: 'dinner', recipeId: recipeA, servings: 2 }) // fuera de rango
    await db.insert(schema.mealPlanEntries).values({ householdId: b, date: '2026-09-01', slot: 'lunch', customTitle: 'De Bo', servings: 1 }) // otro hogar

    const entries = await listEntries(ctxOf(a), { from: '2026-09-01', to: '2026-09-02' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('cooked')
    expect(entries[0]?.kcalPerServing).toBe(400)
    expect(entries[0]?.totalMinutes).toBe(30)
  })
})

describe('moveEntry', () => {
  it('cambia fecha, slot y sortOrder; rechaza un id de otro hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [entry] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!entry) throw new Error('seed')

    const moved = await moveEntry(ctxOf(a), { entryId: entry.id, date: '2026-09-02', slot: 'dinner', sortOrder: 3 })
    expect(moved.date).toBe('2026-09-02')
    expect(moved.slot).toBe('dinner')
    expect(moved.sortOrder).toBe(3)

    await expect(moveEntry(ctxOf(b), { entryId: entry.id, date: '2026-09-03', slot: 'lunch', sortOrder: 0 })).rejects.toThrow()
  })
})

describe('patchEntry', () => {
  it('skipped:true marca skippedAt; skipped:false lo limpia', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [entry] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!entry) throw new Error('seed')

    const skipped = await patchEntry(ctxOf(a), entry.id, { skipped: true })
    expect(skipped.status).toBe('skipped')
    const [row] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, entry.id))
    expect(row?.skippedAt).not.toBeNull()

    const unskipped = await patchEntry(ctxOf(a), entry.id, { skipped: false })
    expect(unskipped.status).toBe('planned')
    const [row2] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, entry.id))
    expect(row2?.skippedAt).toBeNull()
  })
})

describe('createLeftover', () => {
  it('crea una entrada con leftoverOfEntryId y recipeId heredado', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [entry] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 4 }).returning()
    if (!entry) throw new Error('seed')

    const leftover = await createLeftover(ctxOf(a), { ofEntryId: entry.id, date: '2026-09-02', slot: 'lunch', servings: 1 })
    expect(leftover.recipeId).toBe(recipeA)
    expect(leftover.leftoverOfEntryId).toBe(entry.id)
    expect(leftover.servings).toBe(1)

    await expect(createLeftover(ctxOf(b), { ofEntryId: entry.id, date: '2026-09-02', slot: 'lunch', servings: 1 })).rejects.toThrow()
  })
})

describe('rangeNutrition', () => {
  it('agrega kcal por fecha excluyendo saltadas y sobras', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Lentejas') // 400 kcal/ración
    const [counted] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!counted) throw new Error('seed')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'dinner', recipeId: recipeA, servings: 2, skippedAt: new Date() })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'snack', recipeId: recipeA, servings: 2, leftoverOfEntryId: counted.id })

    const { byDate, total } = await rangeNutrition(ctxOf(a), { from: '2026-09-01', to: '2026-09-01' })
    expect(byDate['2026-09-01']?.total.kcal).toBe(800)
    expect(total.total.kcal).toBe(800)
  })
})
