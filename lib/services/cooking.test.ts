import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe } from '@/lib/services/recipes'
import { upsertPantryItem } from '@/lib/services/pantry'
import { buildWarnings, listCookingLog, logCooked } from './cooking'

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

  it('una receta borrada no se puede cocinar y la despensa no se toca', async () => {
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)
    await db.update(schema.recipes).set({ deletedAt: new Date() }).where(eq(schema.recipes.id, recipeId))

    await expect(logCooked(ctxA, { entryId, servingsCooked: 2 })).rejects.toMatchObject({ code: 'not_found' })

    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(1000)
  })

  it('convierte entre la unidad del artículo y la de la necesidad al descontar', async () => {
    // 5 ud de cebolla (150 g/ud) cubren de sobra los 300 g que pide la receta base (2 raciones)
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 5, unit: 'ud', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)

    const result = await logCooked(ctxA, { entryId, servingsCooked: 2 })

    expect(result.deductions).toEqual([{ pantryItemId: item.id, foodId: onionId, requested: 2, deducted: 2, unit: 'ud' }])
    expect(result.warnings).toEqual([])
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(3)
  })

  it('un déficit entre unidades avisa una sola vez en la unidad de la necesidad', async () => {
    // 1 ud (150 g) no llega a los 300 g que pide la receta
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1, unit: 'ud', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)

    const result = await logCooked(ctxA, { entryId, servingsCooked: 2 })

    expect(result.deductions).toEqual([{ pantryItemId: item.id, foodId: onionId, requested: 1, deducted: 1, unit: 'ud' }])
    expect(result.warnings).toEqual([{ foodId: onionId, name: 'cebolla', requested: 300, deducted: 150, unit: 'g' }])
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(0)
  })

  it('el redondeo de numeric(12,3) en un escalado no lineal no genera avisos falsos', async () => {
    // Ingrediente que NO escala linealmente: al escalar con ratio^0.65 la cantidad
    // resultante tiene más de 3 decimales, pero pantry_items.quantity es numeric(12,3).
    // Con despensa de sobra, el UPDATE nunca deja el artículo a 0: no hay recorte real.
    const [salt] = await db
      .insert(schema.foods)
      .values({ nameEs: 'sal', nameEn: 'salt', searchNameEs: 'sal', searchNameEn: 'salt', source: 'usda', kcal100g: 0 })
      .returning()
    if (!salt) throw new Error('setup')
    const detail = await createRecipe(ctxA, {
      title: 'Guiso con sal',
      servingsBase: 3,
      ingredients: [{ rawText: '10 g de sal', foodId: salt.id, quantity: 10, unit: 'g', scalesLinearly: false }],
      steps: [{ text: 'Cuece a fuego lento' }],
      tags: [],
      imageUrls: [],
    })
    const item = await upsertPantryItem(ctxA, { foodId: salt.id, quantity: 10_000, unit: 'g', location: 'pantry' })
    const [entry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: ctxA.householdId, date: '2026-08-27', slot: 'dinner', recipeId: detail.recipe.id, servings: 7 })
      .returning({ id: schema.mealPlanEntries.id })
    if (!entry) throw new Error('setup')

    const result = await logCooked(ctxA, { entryId: entry.id, servingsCooked: 7 })

    expect(result.warnings).toEqual([])
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBeGreaterThan(9_900) // se descontó algo, muy lejos de agotarse
  })

  it('un déficit repartido entre dos artículos de despensa avisa una sola vez', async () => {
    // Dos artículos de cebolla que, sumados, no llegan a los 300 g que pide la receta.
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 50, unit: 'g', location: 'pantry' })
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 30, unit: 'g', location: 'fridge' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)

    const result = await logCooked(ctxA, { entryId, servingsCooked: 2 })

    expect(result.deductions).toHaveLength(2) // se vacían los dos artículos
    expect(result.warnings).toEqual([{ foodId: onionId, name: 'cebolla', requested: 300, deducted: 80, unit: 'g' }])
  })

  it('buildWarnings atribuye el hueco de un artículo agotado al need convertible, nunca al incompatible (sin deducted negativo)', () => {
    // Ajo sin gramsPerUnit: un need en 'ud' y otro en 'g' del mismo alimento no
    // son convertibles entre sí. El need en 'ud' va primero a propósito: es el
    // orden que hacía que `needs.find(n => n.foodId === ...)` (sin filtrar por
    // unidad) picara el need equivocado.
    const garlicId = 'garlic-1'
    const needUd = { foodId: garlicId, quantity: 2, unit: 'ud' as const }
    const needG = { foodId: garlicId, quantity: 100, unit: 'g' as const }
    const conversionByFoodId = new Map([[garlicId, { defaultUnit: null, gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null }]])
    const nameByFoodId = new Map([[garlicId, 'ajo']])
    // Agotado con un hueco real (60.5) entre lo pedido y lo descontado: en la
    // práctica solo lo produce una carrera entre dos logCooked (comentario de
    // buildWarnings), así que aquí se construye el outcome a mano.
    const outcomes = [{ deduction: { pantryItemId: 'p1', foodId: garlicId, requested: 100.5, deducted: 40, unit: 'g' as const }, exhausted: true }]

    const warnings = buildWarnings([needUd, needG], [], outcomes, conversionByFoodId, nameByFoodId)

    expect(warnings).toEqual([{ foodId: garlicId, name: 'ajo', requested: 100, deducted: 39.5, unit: 'g' }])
    for (const w of warnings) expect(w.deducted).toBeGreaterThanOrEqual(0)
  })

  it('dos líneas del mismo alimento en unidades distintas se funden en una sola necesidad', async () => {
    // 200 g + 1 ud (150 g/ud) de cebolla: una sola necesidad de 350 g, no dos.
    const detail = await createRecipe(ctxA, {
      title: 'Cebolla doble',
      servingsBase: 2,
      ingredients: [
        { rawText: '200 g de cebolla', foodId: onionId, quantity: 200, unit: 'g', scalesLinearly: true },
        { rawText: '1 ud de cebolla', foodId: onionId, quantity: 1, unit: 'ud', scalesLinearly: true },
      ],
      steps: [{ text: 'Pocha todo junto' }],
      tags: [],
      imageUrls: [],
    })
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const [entry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: ctxA.householdId, date: '2026-08-27', slot: 'dinner', recipeId: detail.recipe.id, servings: 2 })
      .returning({ id: schema.mealPlanEntries.id })
    if (!entry) throw new Error('setup')

    const result = await logCooked(ctxA, { entryId: entry.id, servingsCooked: 2 })

    expect(result.warnings).toEqual([])
    expect(result.deductions).toEqual([{ pantryItemId: item.id, foodId: onionId, requested: 350, deducted: 350, unit: 'g' }])
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(650)
  })

  it('sin entrada, crea una de hoy con el hueco de la hora y la marca cocinada', async () => {
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    // 20:30 UTC → 22:30 en Europe/Madrid en agosto (CEST) → cena (lib/domain/slots.ts)
    const result = await logCooked(ctxA, { recipeId, servingsCooked: 2 }, new Date('2026-08-27T20:30:00Z'))
    const [entry] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, result.entryId))
    expect(entry?.slot).toBe('dinner')
    expect(entry?.servings).toBe(2)
    expect(entry?.cookedAt).not.toBeNull()
  })

  it('el hueco explícito gana al de la hora', async () => {
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const result = await logCooked(ctxA, { recipeId, servingsCooked: 2, slot: 'breakfast' }, new Date('2026-08-27T20:30:00Z'))
    const [entry] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, result.entryId))
    expect(entry?.slot).toBe('breakfast')
  })

  it('crea la entrada de sobras ligada a la original', async () => {
    const entryId = await makeEntry(ctxA, '2026-08-27', 4)
    const result = await logCooked(ctxA, { entryId, servingsCooked: 4, leftovers: { servings: 2, date: '2026-08-28', slot: 'lunch' } })
    expect(result.leftoverEntryId).not.toBeNull()
    const [left] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, result.leftoverEntryId as string))
    expect(left).toMatchObject({ date: '2026-08-28', slot: 'lunch', servings: 2, leftoverOfEntryId: entryId, recipeId })
    expect(left?.cookedAt).toBeNull()
  })

  it('registrar dos veces la misma entrada da conflicto y no descuenta dos veces', async () => {
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 2)
    await logCooked(ctxA, { entryId, servingsCooked: 2 })
    await expect(logCooked(ctxA, { entryId, servingsCooked: 2 })).rejects.toMatchObject({ code: 'conflict' })
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(700)
  })

  // Riesgo §18.4 del spec: dos cocciones simultáneas sobre el mismo alimento.
  it('dos logCooked a la vez nunca dejan negativo ni descuentan de más', async () => {
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 500, unit: 'g', location: 'pantry' })
    const e1 = await makeEntry(ctxA, '2026-08-27', 2)
    const e2 = await makeEntry(ctxA, '2026-08-28', 2)
    const results = await Promise.all([logCooked(ctxA, { entryId: e1, servingsCooked: 2 }), logCooked(ctxA, { entryId: e2, servingsCooked: 2 })])
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    // 500 − 300 − 300 nunca baja de 0, y entre las dos se descontaron exactamente 500
    expect(pantry?.quantity).toBe(0)
    const totalDeducted = results.flatMap((r) => r.deductions).reduce((s, d) => s + d.deducted, 0)
    expect(totalDeducted).toBe(500)
    // La que llegó segunda avisa de lo que faltó
    expect(results.some((r) => r.warnings.length === 1)).toBe(true)
  })

  it('listCookingLog devuelve el historial del hogar, lo más reciente primero, y aísla hogares', async () => {
    const e1 = await makeEntry(ctxA, '2026-08-26', 2)
    const e2 = await makeEntry(ctxA, '2026-08-27', 2)
    await logCooked(ctxA, { entryId: e1, servingsCooked: 2 }, new Date('2026-08-26T20:00:00Z'))
    await logCooked(ctxA, { entryId: e2, servingsCooked: 3 }, new Date('2026-08-27T20:00:00Z'))
    const log = await listCookingLog(ctxA, 10)
    expect(log.map((l) => l.servingsCooked)).toEqual([3, 2])
    expect(log[0]?.title).toBe('Sopa de cebolla')
    expect(log[0]?.warnings).toHaveLength(log[0]?.warningCount ?? -1) // warnings y warningCount consistentes
    expect(await listCookingLog(ctxB, 10)).toEqual([])
  })

  it('listCookingLog rechaza un limit fuera de 1..100', async () => {
    await expect(listCookingLog(ctxA, 0)).rejects.toMatchObject({ code: 'validation' })
    await expect(listCookingLog(ctxA, 101)).rejects.toMatchObject({ code: 'validation' })
    await expect(listCookingLog(ctxA, 1.5)).rejects.toMatchObject({ code: 'validation' })
  })

  it('una sobra no se puede cocinar: la despensa ya se descontó el día que se cocinó el original', async () => {
    const item = await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const entryId = await makeEntry(ctxA, '2026-08-27', 4)
    const result = await logCooked(ctxA, { entryId, servingsCooked: 4, leftovers: { servings: 2, date: '2026-08-28', slot: 'lunch' } })
    const leftoverEntryId = result.leftoverEntryId as string

    await expect(logCooked(ctxA, { entryId: leftoverEntryId, servingsCooked: 2 })).rejects.toMatchObject({ code: 'validation' })

    // Ni descuento (más allá del cocinado original), ni log nuevo, ni times_cooked de más.
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, item.id))
    expect(pantry?.quantity).toBe(400) // 1000 − 600 (4 raciones) del cocinado original, nada más
    const logs = await db.select().from(schema.cookingLog).where(eq(schema.cookingLog.householdId, ctxA.householdId))
    expect(logs).toHaveLength(1)
    const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId))
    expect(recipe?.timesCooked).toBe(1)
  })

  it('cocinar desde receta dos veces seguidas (mismas raciones, <5 min) es idempotente: mismo resultado, sin segunda entrada ni descuento', async () => {
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const first = await logCooked(ctxA, { recipeId, servingsCooked: 2 }, new Date('2026-08-27T20:00:00Z'))
    const second = await logCooked(ctxA, { recipeId, servingsCooked: 2 }, new Date('2026-08-27T20:04:00Z'))

    expect(second).toEqual(first)
    const entries = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, ctxA.householdId))
    expect(entries).toHaveLength(1) // no se creó una segunda entrada
    const [pantry] = await db.select().from(schema.pantryItems)
    expect(pantry?.quantity).toBe(700) // 1000 − 300: solo se descontó una vez
    const logs = await db.select().from(schema.cookingLog).where(eq(schema.cookingLog.householdId, ctxA.householdId))
    expect(logs).toHaveLength(1)
  })

  it('cocinar desde receta pasados los 5 minutos es un cocinado nuevo de verdad', async () => {
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    const first = await logCooked(ctxA, { recipeId, servingsCooked: 2 }, new Date('2026-08-27T20:00:00Z'))
    const second = await logCooked(ctxA, { recipeId, servingsCooked: 2 }, new Date('2026-08-27T20:05:01Z'))

    expect(second.entryId).not.toBe(first.entryId)
    const entries = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, ctxA.householdId))
    expect(entries).toHaveLength(2)
    const [pantry] = await db.select().from(schema.pantryItems)
    expect(pantry?.quantity).toBe(400) // 1000 − 300 − 300: se descontó dos veces
  })

  it('el hueco por hora usa la zona horaria del hogar, no UTC: 23:30 UTC ya es otro día y madrugada en Madrid', async () => {
    await upsertPantryItem(ctxA, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
    // 23:30 UTC del 27 de agosto son las 01:30 CEST del 28: otro día y hueco de picoteo.
    const result = await logCooked(ctxA, { recipeId, servingsCooked: 2 }, new Date('2026-08-27T23:30:00Z'))
    const [entry] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, result.entryId))
    expect(entry?.date).toBe('2026-08-28')
    expect(entry?.slot).toBe('snack')
  })
})
