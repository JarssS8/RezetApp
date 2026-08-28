import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { FoodInput } from '@/lib/validation/foods'
import { conflictingRecipeIds, householdAllergens, recipeAllergenMap } from './allergens'
import type { Ctx } from './ctx'
import { createFood, mergeFoods } from './foods'
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

describe('conflictingRecipeIds', () => {
  // F2 de T28: si nadie en el hogar tiene alérgenos declarados, la función
  // corta antes de mirar recetas ni alimentos (no tiene sentido calcular un
  // choque que nunca puede darse).
  it('si nadie en el hogar tiene alérgenos, no mira las recetas y devuelve un mapa vacío', async () => {
    const harina = await createFood(ctxA, foodInput({ nameEs: 'harina', nameEn: 'flour', allergens: ['gluten'] }))
    const conHarina = await createRecipe(ctxA, { title: 'Bizcocho', servingsBase: 8, tags: [], imageUrls: [], ingredients: [{ rawText: '200 g de harina', foodId: harina.id, quantity: 200, unit: 'g' }], steps: [{ text: 'Hornea' }] })

    expect(await conflictingRecipeIds(ctxA, [conHarina.recipe.id])).toEqual(new Map())

    // El atajo se nota: con el espía puesto, solo sale la consulta de
    // householdAllergens; la de ingredientes no llega a ejecutarse. Sin esto,
    // el caso no distinguiría "cortó por lo sano" de "consultó todo y no
    // encontró nada", que es justo lo que la revisión de W4 quería cubrir.
    const spy = vi.spyOn(ctxA.db, 'select')
    await conflictingRecipeIds(ctxA, [conHarina.recipe.id])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('marca solo las recetas que chocan, con el alérgeno concreto', async () => {
    await db.update(schema.householdMembers).set({ allergens: ['gluten'] }).where(eq(schema.householdMembers.userId, anaId))
    const harina = await createFood(ctxA, foodInput({ nameEs: 'harina', nameEn: 'flour', allergens: ['gluten'] }))
    const conHarina = await createRecipe(ctxA, { title: 'Bizcocho', servingsBase: 8, tags: [], imageUrls: [], ingredients: [{ rawText: '200 g de harina', foodId: harina.id, quantity: 200, unit: 'g' }], steps: [{ text: 'Hornea' }] })
    const sinHarina = await createRecipe(ctxA, { title: 'Ensalada', servingsBase: 2, tags: [], imageUrls: [], ingredients: [{ rawText: '1 lechuga' }], steps: [{ text: 'Corta' }] })

    const conflicts = await conflictingRecipeIds(ctxA, [conHarina.recipe.id, sinHarina.recipe.id])
    expect(conflicts.get(conHarina.recipe.id)).toEqual(['gluten'])
    expect(conflicts.has(sinHarina.recipe.id)).toBe(false)
  })

  // Fix 1 de la revisión final: mergeFoods traslada los alérgenos del
  // fusionado al que se queda, así que una receta que antes no chocaba puede
  // pasar a chocar después de una fusión (y el filtro tiene que seguir viéndolo).
  it('una receta sigue en conflicto tras la fusión: el alérgeno del duplicado pasa al alimento que se queda', async () => {
    await db.update(schema.householdMembers).set({ allergens: ['gluten'] }).where(eq(schema.householdMembers.userId, anaId))
    const generica = await createFood(ctxA, foodInput({ nameEs: 'harina blanca', nameEn: 'white flour' }))
    const conGluten = await createFood(ctxA, foodInput({ nameEs: 'harina de trigo', nameEn: 'wheat flour', allergens: ['gluten'] }))
    const receta = await createRecipe(ctxA, {
      title: 'Bizcocho',
      servingsBase: 8,
      tags: [],
      imageUrls: [],
      ingredients: [{ rawText: '200 g de harina blanca', foodId: generica.id, quantity: 200, unit: 'g' }],
      steps: [{ text: 'Hornea' }],
    })

    // Antes de fusionar, la harina blanca no tiene gluten: no choca.
    expect(await conflictingRecipeIds(ctxA, [receta.recipe.id])).toEqual(new Map())

    await mergeFoods(ctxA, conGluten.id, generica.id)

    const conflicts = await conflictingRecipeIds(ctxA, [receta.recipe.id])
    expect(conflicts.get(receta.recipe.id)).toEqual(['gluten'])
  })
})
