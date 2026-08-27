import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import tagsSeed from '@/db/seed/tags.json'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe, exportAll, getRecipe, prepareIngredients, recentlyCooked, searchRecipes, softDeleteRecipe, updateRecipe } from './recipes'

type TagSeed = { slug: string; name: { es: string; en: string }; parent: string | null }

// Etiquetas globales de db/seed/tags.json, sin pasar por scripts/seed.ts
// (los tests de servicios no pueden depender de 'scripts': ver eslint boundaries).
// Dos pasadas: padres (parent null) antes que hijos, igual que seedTags.
async function seedGlobalTags(db: TestDb): Promise<void> {
  const list = tagsSeed as TagSeed[]
  const idBySlug = new Map<string, string>()
  for (const pass of [0, 1]) {
    for (const t of list) {
      if ((t.parent === null) !== (pass === 0)) continue
      const parentId = t.parent ? (idBySlug.get(t.parent) ?? null) : null
      const [row] = await db.insert(schema.tags).values({ householdId: null, slug: t.slug, name: t.name.es, nameEn: t.name.en, parentId }).returning({ id: schema.tags.id })
      if (row) idBySlug.set(t.slug, row.id)
    }
  }
}

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
  it('deduplica etiquetas repetidas o con solo variación de mayúsculas/acentos', async () => {
    const d = await createRecipe(ctxA, { ...input, tags: ['Vegano', 'vegano', 'básico', 'basico'] })
    expect(d.tags.map((t) => t.slug).sort()).toEqual(['basico', 'vegano'])
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
  it('rechaza un número de raciones que no sea positivo', async () => {
    const d = await createRecipe(ctxA, input)
    await expect(getRecipe(ctxA, d.recipe.id, { servings: 0 })).rejects.toMatchObject({ code: 'validation' })
    await expect(getRecipe(ctxA, d.recipe.id, { servings: -2 })).rejects.toMatchObject({ code: 'validation' })
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

describe('prepareIngredients', () => {
  it('resuelve por la primera palabra cuando el nombre completo no alcanza el umbral de trigram', async () => {
    const prepared = await prepareIngredients(ctxA, [{ rawText: '2 cebollas grandes', scalesLinearly: true }], 'es')
    expect(prepared[0]).toMatchObject({ foodId: onionId, quantity: 300, unit: 'g', needsReview: false })
  })
  it('infiere unidad "ud" para alimentos sin gramos por unidad y no la convierte a gramos', async () => {
    const [egg] = await db
      .insert(schema.foods)
      .values({ nameEs: 'huevo', nameEn: 'egg', searchNameEs: 'huevo', searchNameEn: 'egg', source: 'usda', kcal100g: 155, protein100g: 13, carbs100g: 1.1, fat100g: 11, fiber100g: 0 })
      .returning()
    if (!egg) throw new Error('setup')
    const prepared = await prepareIngredients(ctxA, [{ rawText: '2 huevos', foodId: egg.id, scalesLinearly: true }], 'es')
    expect(prepared[0]).toMatchObject({ quantity: 2, unit: 'ud', displayQuantity: 2, displayUnit: 'ud' })
  })
  it('marca needsReview cuando no logra resolver el alimento de la línea', async () => {
    const prepared = await prepareIngredients(ctxA, [{ rawText: 'de queso', scalesLinearly: true }], 'es')
    expect(prepared[0]?.foodId).toBeNull()
    expect(prepared[0]?.needsReview).toBe(true)
  })
  it('descarta un foodId que apunta a un alimento privado de otro hogar', async () => {
    const [foreign] = await db
      .insert(schema.foods)
      .values({ householdId: ctxB.householdId, nameEs: 'queso secreto de b', nameEn: 'secret cheese', searchNameEs: 'queso secreto de b', searchNameEn: 'secret cheese', source: 'manual', kcal100g: 300 })
      .returning()
    if (!foreign) throw new Error('setup')
    const prepared = await prepareIngredients(ctxA, [{ rawText: 'queso secreto de b', foodId: foreign.id, scalesLinearly: true }], 'es')
    expect(prepared[0]?.foodId).not.toBe(foreign.id)
    expect(prepared[0]?.foodId).toBeNull()
  })
})

// Editor W2-R18: cuando el navegador manda displayQuantity/displayUnit
// corregidos a mano pero SIN quantity/unit (el navegador nunca convierte
// unidades, solo conoce el alimento por su id), el servicio convierte con
// la conversión real del alimento y respeta el scalesLinearly recibido
// -no aplica la heurística, que es solo para líneas de texto libre-.
describe('prepareIngredients con displayQuantity corregido a mano (sin quantity)', () => {
  it('convierte tazas con la conversión propia del alimento (gramsPerCup)', async () => {
    const [flour] = await db
      .insert(schema.foods)
      .values({
        nameEs: 'harina', nameEn: 'flour', searchNameEs: 'harina', searchNameEn: 'flour', source: 'usda',
        kcal100g: 364, protein100g: 10, carbs100g: 76, fat100g: 1, fiber100g: 2.7, gramsPerCup: 120,
      })
      .returning()
    if (!flour) throw new Error('setup')
    const prepared = await prepareIngredients(
      ctxA,
      [{ rawText: '2 tazas de harina', foodId: flour.id, displayQuantity: 2, displayUnit: 'cup', scalesLinearly: true }],
      'es',
    )
    expect(prepared[0]).toMatchObject({ quantity: 240, unit: 'g', scalesLinearly: true, needsReview: false })
  })

  it('convierte "diente" con los gramos por unidad del alimento', async () => {
    const [garlic] = await db
      .insert(schema.foods)
      .values({
        nameEs: 'ajo', nameEn: 'garlic', searchNameEs: 'ajo', searchNameEn: 'garlic', source: 'usda',
        kcal100g: 149, protein100g: 6.4, carbs100g: 33, fat100g: 0.5, fiber100g: 2.1, gramsPerUnit: 5,
      })
      .returning()
    if (!garlic) throw new Error('setup')
    const prepared = await prepareIngredients(
      ctxA,
      [{ rawText: '3 dientes de ajo', foodId: garlic.id, displayQuantity: 3, displayUnit: 'diente', scalesLinearly: true }],
      'es',
    )
    expect(prepared[0]).toMatchObject({ quantity: 15, unit: 'g', needsReview: false })
  })

  it('unidad desconocida sin conversión posible → quantity/unit a null y needsReview', async () => {
    const prepared = await prepareIngredients(
      ctxA,
      [{ rawText: '2 de sal', foodId: saltId, displayQuantity: 2, displayUnit: 'zzz-unidad-inventada', scalesLinearly: false }],
      'es',
    )
    expect(prepared[0]).toMatchObject({ quantity: null, unit: null, needsReview: true, scalesLinearly: false })
  })

  it('respeta scalesLinearly recibido en vez de la heurística', async () => {
    // La heurística marcaría la cebolla como escalable (true); aquí se
    // respeta el false que llega explícito desde el editor.
    const prepared = await prepareIngredients(
      ctxA,
      [{ rawText: '1 cebolla', foodId: onionId, displayQuantity: 1, displayUnit: 'ud', scalesLinearly: false }],
      'es',
    )
    expect(prepared[0]).toMatchObject({ scalesLinearly: false })
  })
})

// I6/fix 3 de la revisión final: un cliente que manda quantity/unit ya resueltos
// (típico de MCP) pero omite scalesLinearly no debe colar una especia como lineal
// (antes, z.boolean().default(true) lo indistinguía de un 'true' explícito).
describe('prepareIngredients con quantity/unit resueltos y scalesLinearly omitido (estilo MCP)', () => {
  it('sin el campo, aplica la heurística por nombre del alimento (sal → false)', async () => {
    const prepared = await prepareIngredients(ctxA, [{ rawText: '2 cucharaditas de sal', foodId: saltId, quantity: 10, unit: 'g' }], 'es')
    expect(prepared[0]).toMatchObject({ quantity: 10, unit: 'g', scalesLinearly: false })
  })

  it('sin el campo, un alimento que sí escala linealmente da true', async () => {
    const prepared = await prepareIngredients(ctxA, [{ rawText: '100 g de cebolla', foodId: onionId, quantity: 100, unit: 'g' }], 'es')
    expect(prepared[0]).toMatchObject({ quantity: 100, unit: 'g', scalesLinearly: true })
  })

  it('con scalesLinearly explícito, se respeta en vez de la heurística', async () => {
    const prepared = await prepareIngredients(ctxA, [{ rawText: '2 cucharaditas de sal', foodId: saltId, quantity: 10, unit: 'g', scalesLinearly: true }], 'es')
    expect(prepared[0]).toMatchObject({ scalesLinearly: true })
  })
})

describe('searchRecipes', () => {
  it('full-text con websearch, filtros y orden; solo del hogar', async () => {
    await createRecipe(ctxA, input)
    await createRecipe(ctxA, { ...input, title: 'Tortilla de patatas', tags: ['clásico'], prepMinutes: 10, cookMinutes: 20, difficulty: 'easy' })
    await createRecipe(ctxB, { ...input, title: 'Cebolla ajena' })
    expect((await searchRecipes(ctxA, { q: 'cebolla', limit: 20, offset: 0, sort: 'relevance' })).items.map((r) => r.title)).toEqual(['Cebolla caramelizada'])
    expect((await searchRecipes(ctxA, { tags: ['clasico'], limit: 20, offset: 0, sort: 'title' })).items.map((r) => r.title)).toEqual(['Tortilla de patatas'])
    expect((await searchRecipes(ctxA, { maxMinutes: 25, limit: 20, offset: 0, sort: 'title' })).items).toHaveLength(0)
    expect((await searchRecipes(ctxA, { maxMinutes: 30, difficulty: 'easy', limit: 20, offset: 0, sort: 'title' })).items).toHaveLength(1)
    expect((await searchRecipes(ctxA, { hasIngredients: [saltId], limit: 20, offset: 0, sort: 'title' })).total).toBe(2)
  })
  it('onlyWithPantry: recetas cuyos alimentos con food_id están todos en la despensa', async () => {
    await createRecipe(ctxA, input)
    expect((await searchRecipes(ctxA, { onlyWithPantry: true, limit: 20, offset: 0, sort: 'title' })).items).toHaveLength(0)
    await db.insert(schema.pantryItems).values([
      { householdId: ctxA.householdId, foodId: onionId, quantity: 500, unit: 'g' },
      { householdId: ctxA.householdId, foodId: saltId, quantity: 100, unit: 'g' },
    ])
    expect((await searchRecipes(ctxA, { onlyWithPantry: true, limit: 20, offset: 0, sort: 'title' })).items).toHaveLength(1)
  })
  it('buscar por una etiqueta padre encuentra las recetas de sus hijas', async () => {
    await seedGlobalTags(db)
    await createRecipe(ctxA, { title: 'Lentejas', servingsBase: 4, tags: ['Vegetariano'], ingredients: [{ rawText: '300 g de lentejas' }], steps: [{ text: 'Cuece' }], imageUrls: [] })
    const { items } = await searchRecipes(ctxA, { tags: ['dieta'], limit: 20, offset: 0, sort: 'recent' })
    expect(items.map((r) => r.title)).toEqual(['Lentejas'])
  })
})

describe('exportAll', () => {
  it('exporta recetas con ingredientes, pasos y etiquetas, sin ids internos', async () => {
    await createRecipe(ctxA, input)
    const e = await exportAll(ctxA)
    expect(e.version).toBe(1)
    expect(e.recipes[0]).toMatchObject({ title: 'Cebolla caramelizada', servingsBase: 4, tags: expect.arrayContaining(['guarnición']) })
    expect(JSON.stringify(e)).not.toContain(ctxA.householdId)
  })
})

describe('recentlyCooked', () => {
  it('solo recetas con last_cooked_at, del hogar, más recientes primero', async () => {
    const sopa = await createRecipe(ctxA, { ...input, title: 'Sopa' })
    const tostada = await createRecipe(ctxA, { ...input, title: 'Tostada' })
    await createRecipe(ctxA, { ...input, title: 'Sin cocinar' })
    await createRecipe(ctxB, { ...input, title: 'De otro hogar' })
    await db.update(schema.recipes).set({ lastCookedAt: new Date('2026-01-01T00:00:00Z') }).where(eq(schema.recipes.id, sopa.recipe.id))
    await db.update(schema.recipes).set({ lastCookedAt: new Date('2026-02-01T00:00:00Z') }).where(eq(schema.recipes.id, tostada.recipe.id))

    const result = await recentlyCooked(ctxA, 5)

    expect(result.map((r) => r.title)).toEqual(['Tostada', 'Sopa'])
    expect(result[0]).toMatchObject({ id: tostada.recipe.id, title: 'Tostada' })
  })

  it('respeta el límite', async () => {
    for (const title of ['A', 'B', 'C']) {
      const r = await createRecipe(ctxA, { ...input, title })
      await db.update(schema.recipes).set({ lastCookedAt: new Date() }).where(eq(schema.recipes.id, r.recipe.id))
    }
    expect(await recentlyCooked(ctxA, 2)).toHaveLength(2)
  })
})
