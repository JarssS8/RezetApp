import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe, getRecipe, softDeleteRecipe, updateRecipe } from './recipes'

let db: TestDb
let ctxA: Ctx
let ctxB: Ctx
let onionId: string
let saltId: string

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
  const [onion] = await db
    .insert(schema.foods)
    .values({
      nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda',
      kcal100g: 40, protein100g: 1.1, carbs100g: 9.3, fat100g: 0.1, fiber100g: 1.7, gramsPerUnit: 150,
    })
    .returning()
  const [salt] = await db
    .insert(schema.foods)
    .values({
      nameEs: 'sal', nameEn: 'salt', searchNameEs: 'sal', searchNameEn: 'salt', source: 'usda',
      kcal100g: 0, protein100g: 0, carbs100g: 0, fat100g: 0, fiber100g: 0,
    })
    .returning()
  if (!onion || !salt) throw new Error('setup')
  onionId = onion.id
  saltId = salt.id
})

const input = {
  title: 'Cebolla caramelizada',
  servingsBase: 4,
  ingredients: [
    { rawText: '2 cebollas grandes', scalesLinearly: true },
    { rawText: '1 cdta de sal', scalesLinearly: true },
  ],
  steps: [{ text: 'Pocha la cebolla 25 minutos a fuego suave' }],
  tags: ['guarnición', 'básico'],
  imageUrls: [],
}

describe('createRecipe', () => {
  it('parsea ingredientes, resuelve alimentos, marca la sal como no lineal y calcula nutrición por ración', async () => {
    const d = await createRecipe(ctxA, input)
    expect(d.ingredients.map((i) => i.foodId)).toEqual([onionId, saltId])
    expect(d.ingredients[0]).toMatchObject({ quantity: 300, unit: 'g', displayQuantity: 2, displayUnit: 'ud', scalesLinearly: true })
    expect(d.ingredients[1]).toMatchObject({ quantity: 5, unit: 'ml', displayUnit: 'tsp', scalesLinearly: false })
    expect(d.nutrition?.perServing.kcal).toBeCloseTo(30, 0) // 300 g × 40 kcal/100 g / 4
    expect(d.recipe.kcalPerServing).toBeCloseTo(30, 0)
    expect(d.steps[0]?.timerSeconds).toBe(1500)
    expect(d.tags.map((t) => t.slug).sort()).toEqual(['basico', 'guarnicion'])
  })
  it('respeta quantity/unit/foodId explícitos y no los reparsea', async () => {
    const d = await createRecipe(ctxA, { ...input, ingredients: [{ rawText: 'cebolla', foodId: onionId, quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g', scalesLinearly: true }] })
    expect(d.ingredients[0]).toMatchObject({ quantity: 100, unit: 'g', foodId: onionId })
  })
})

describe('getRecipe', () => {
  it('escala a N raciones sin cambiar kcal por ración y marca no lineales', async () => {
    const d = await createRecipe(ctxA, input)
    const g = await getRecipe(ctxA, d.recipe.id, { servings: 8 })
    expect(g?.scaled?.ratio).toBe(2)
    expect(g?.scaled?.ingredients[0]?.quantity).toBe(600)
    expect(g?.scaled?.ingredients[1]?.quantity).toBeCloseTo(5 * Math.pow(2, 0.65), 3)
    expect(g?.scaled?.nonLinearIds).toEqual([d.ingredients[1]?.id])
    expect(g?.nutrition?.perServing.kcal).toBeCloseTo(30, 0)
  })
  it('no devuelve recetas de otro hogar ni borradas', async () => {
    const d = await createRecipe(ctxA, input)
    expect(await getRecipe(ctxB, d.recipe.id)).toBeNull()
    await softDeleteRecipe(ctxA, d.recipe.id)
    expect(await getRecipe(ctxA, d.recipe.id)).toBeNull()
    await expect(softDeleteRecipe(ctxB, d.recipe.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('updateRecipe', () => {
  it('reemplaza ingredientes, pasos y etiquetas y recalcula la nutrición', async () => {
    const d = await createRecipe(ctxA, input)
    const u = await updateRecipe(ctxA, d.recipe.id, { ...input, servingsBase: 2, ingredients: [{ rawText: '1 cebolla', scalesLinearly: true }], steps: [{ text: 'Sofríe' }], tags: [] })
    expect(u.ingredients).toHaveLength(1)
    expect(u.recipe.kcalPerServing).toBeCloseTo(30, 0) // 150 g × 0.4 / 2
    expect(u.tags).toEqual([])
    await expect(updateRecipe(ctxB, d.recipe.id, input)).rejects.toMatchObject({ code: 'not_found' })
  })
})
