import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { FoodInput } from '@/lib/validation/foods'
import { householdAllergens, recipeAllergenMap } from './allergens'
import type { Ctx } from './ctx'
import { createFood } from './foods'
import { createRecipe } from './recipes'

let db: TestDb
let ctxA: Ctx
let ctxB: Ctx
let anaId: string
let boId: string

function foodInput(overrides: Partial<FoodInput> & Pick<FoodInput, 'nameEs' | 'nameEn'>): FoodInput {
  return { aliases: [], defaultUnit: 'g', allergens: [], seasonalMonths: [], ...overrides }
}

async function makeHousehold(name: string): Promise<{ ctx: Ctx; userId: string }> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('seed')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { ctx: { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }, userId: u.id }
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)

beforeEach(async () => {
  await truncateAll(db)
  const a = await makeHousehold('Casa A')
  ctxA = a.ctx
  anaId = a.userId
  const b = await makeHousehold('Casa B')
  ctxB = b.ctx
})

describe('householdAllergens', () => {
  it('reúne los alérgenos de todos los miembros del hogar, sin repetir', async () => {
    await db.update(schema.householdMembers).set({ allergens: ['gluten'] }).where(eq(schema.householdMembers.userId, anaId))
    const [bo] = await db.insert(schema.users).values({ displayName: 'Bo' }).returning()
    if (!bo) throw new Error('seed')
    boId = bo.id
    await db.insert(schema.householdMembers).values({ householdId: ctxA.householdId, userId: boId, role: 'member', allergens: ['gluten', 'fish'] })

    expect((await householdAllergens(ctxA)).sort()).toEqual(['fish', 'gluten'])
  })
})

describe('recipeAllergenMap', () => {
  it('calcula los alérgenos de cada receta desde sus alimentos y marca los ingredientes sin resolver', async () => {
    const harina = await createFood(ctxA, foodInput({ nameEs: 'harina', nameEn: 'flour', allergens: ['gluten'] }))
    const conHarina = await createRecipe(ctxA, { title: 'Bizcocho', servingsBase: 8, tags: [], imageUrls: [], ingredients: [{ rawText: '200 g de harina', foodId: harina.id, quantity: 200, unit: 'g' }], steps: [{ text: 'Hornea' }] })
    const sinResolver = await createRecipe(ctxA, { title: 'Misterio', servingsBase: 2, tags: [], imageUrls: [], ingredients: [{ rawText: 'un chorrito de algo raro' }], steps: [{ text: 'Mezcla' }] })

    const map = await recipeAllergenMap(ctxA, [conHarina.recipe.id, sinResolver.recipe.id])
    expect(map.get(conHarina.recipe.id)).toEqual({ allergens: ['gluten'], unknown: false })
    expect(map.get(sinResolver.recipe.id)).toEqual({ allergens: [], unknown: true })
  })

  it('no ve recetas de otro hogar', async () => {
    const ajena = await createRecipe(ctxB, { title: 'Ajena', servingsBase: 2, tags: [], imageUrls: [], ingredients: [{ rawText: '1 huevo' }], steps: [{ text: 'Bate' }] })
    expect((await recipeAllergenMap(ctxA, [ajena.recipe.id])).size).toBe(0)
  })
})
