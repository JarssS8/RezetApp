import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe } from '@/lib/services/recipes'
import { upsertPantryItem } from '@/lib/services/pantry'
import { logCooked } from './cooking'

let db: TestDb, ctxA: Ctx, ctxB: Ctx, onionId: string, recipeId: string

async function makeHousehold(name: string): Promise<Ctx> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('setup')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
}

async function makeEntry(ctx: Ctx, date: string, servings: number): Promise<string> {
  const [e] = await db
    .insert(schema.mealPlanEntries)
    .values({ householdId: ctx.householdId, date, slot: 'dinner', recipeId, servings })
    .returning({ id: schema.mealPlanEntries.id })
  if (!e) throw new Error('setup')
  return e.id
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)

beforeEach(async () => {
  await truncateAll(db)
  ctxA = await makeHousehold('A')
  ctxB = await makeHousehold('B')
  const [onion] = await db
    .insert(schema.foods)
    .values({ nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda', kcal100g: 40, gramsPerUnit: 150, defaultUnit: 'g' })
    .returning()
  if (!onion) throw new Error('setup')
  onionId = onion.id
  // 2 raciones base, 300 g de cebolla: cocinar 4 raciones pide 600 g
  const detail = await createRecipe(ctxA, {
    title: 'Sopa de cebolla',
    servingsBase: 2,
    ingredients: [{ rawText: '300 g de cebolla', foodId: onionId, quantity: 300, unit: 'g', scalesLinearly: true }],
    steps: [{ text: 'Pocha la cebolla 20 minutos' }],
    tags: [],
    imageUrls: [],
  })
  recipeId = detail.recipe.id
})

describe('logCooked', () => {
  it('descuenta la despensa escalada a las raciones cocinadas y deja rastro completo', async () => {
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 4)

    const result = await logCooked(ctxA, { entryId, servingsCooked: 4 })

    expect(result.entryId).toBe(entryId)
    expect(result.recipeId).toBe(recipeId)
    expect(result.servingsCooked).toBe(4)
    expect(result.warnings).toEqual([])
    expect(result.deductions).toEqual([{ pantryItemId: item.id, foodId: onionId, requested: 600, deducted: 600, unit: 'g' }])

    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(400)

    const [entry] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, entryId))
    expect(entry?.cookedAt).not.toBeNull()

    const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId))
    expect(recipe?.timesCooked).toBe(1)
    expect(recipe?.lastCookedAt).not.toBeNull()

    const [log] = await db.select().from(schema.cookingLog).where(eq(schema.cookingLog.householdId, ctxA.householdId))
    expect(log?.id).toBe(result.logId)
    expect(log?.servingsCooked).toBe(4)
    expect(log?.kcalPerServingSnapshot).toBe(recipe?.kcalPerServing ?? null)
    expect(log?.pantryDeductions).toEqual(result.deductions)
  })

  it('sin despensa suficiente deja el artículo en 0 y avisa, sin fallar', async () => {
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 100, unit: 'g', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)

    const result = await logCooked(ctxA, { entryId, servingsCooked: 2 })

    expect(result.deductions).toEqual([{ pantryItemId: item.id, foodId: onionId, requested: 100, deducted: 100, unit: 'g' }])
    expect(result.warnings).toEqual([{ foodId: onionId, name: 'cebolla', requested: 300, deducted: 100, unit: 'g' }])
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(0) // se conserva en 0: el usuario decide si borrarlo
  })

  it('sin nada en la despensa avisa de todo lo que falta', async () => {
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)
    const result = await logCooked(ctxA, { entryId, servingsCooked: 2 })
    expect(result.deductions).toEqual([])
    expect(result.warnings).toEqual([{ foodId: onionId, name: 'cebolla', requested: 300, deducted: 0, unit: 'g' }])
  })

  it('una entrada de otro hogar no existe', async () => {
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)
    await expect(logCooked(ctxB, { entryId, servingsCooked: 2 })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('una entrada sin receta (comida libre) no se puede registrar', async () => {
    const [free] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: ctxA.householdId, date: '2026-08-27', slot: 'dinner', customTitle: 'Pizza', servings: 2 })
      .returning({ id: schema.mealPlanEntries.id })
    await expect(logCooked(ctxA, { entryId: free!.id, servingsCooked: 2 })).rejects.toMatchObject({ code: 'validation' })
  })
})
