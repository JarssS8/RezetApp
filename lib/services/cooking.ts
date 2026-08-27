// El bucle de docs/01-PRODUCTO.md: cocinar descuenta de la despensa. Todo pasa
// en UNA transacción (spec §9.5) porque un descuento a medias deja la despensa
// mintiendo, y de ahí abajo miente el sistema entero.
import { and, eq, inArray, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { allocateDeductions, scaleRecipe } from '@/lib/domain'
import type { Allocation, BaseUnit, FoodConversion, Need, PantryItem as DomainPantryItem } from '@/lib/domain/types'
import { emitHouseholdEvent } from '@/lib/events/bus'
import type { LogCookedInput } from '@/lib/validation/cooking'
import { type Ctx, type Db, ServiceError } from './ctx'
import { toIngredient } from './recipe-mapper'

export interface PantryDeduction {
  pantryItemId: string
  foodId: string
  requested: number
  deducted: number
  unit: BaseUnit
}

export interface CookingWarning {
  foodId: string
  name: string
  requested: number
  deducted: number
  unit: BaseUnit
}

export interface CookedResult {
  logId: string
  entryId: string
  recipeId: string
  servingsCooked: number
  kcalPerServing: number | null
  deductions: PantryDeduction[]
  warnings: CookingWarning[]
  leftoverEntryId: string | null
}

interface LockedEntry {
  id: string
  date: string
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipeId: string
}

// Bloquea la entrada del plan y comprueba la barandilla de idempotencia: dos
// pulsaciones de "he cocinado esto" (o un reintento del cliente MCP) no deben
// descontar la despensa dos veces. El SELECT ... FOR UPDATE hace que la segunda
// transacción espere y vea ya el cooked_at de la primera.
async function lockEntry(tx: Db, householdId: string, entryId: string): Promise<LockedEntry> {
  const [row] = await tx
    .select({
      id: schema.mealPlanEntries.id,
      date: schema.mealPlanEntries.date,
      slot: schema.mealPlanEntries.slot,
      recipeId: schema.mealPlanEntries.recipeId,
      cookedAt: schema.mealPlanEntries.cookedAt,
    })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.id, entryId), eq(schema.mealPlanEntries.householdId, householdId)))
    .limit(1)
    .for('update')
  if (!row) throw new ServiceError('not_found', 'Entrada del plan no encontrada')
  if (row.cookedAt !== null) throw new ServiceError('conflict', 'Esa comida ya está marcada como cocinada')
  // cooking_log.recipe_id es NOT NULL: una comida libre (solo custom_title) no
  // tiene ingredientes que descontar ni nutrición que registrar.
  if (row.recipeId === null) throw new ServiceError('validation', 'Esa comida no tiene receta: no hay nada que descontar')
  return { id: row.id, date: row.date, slot: row.slot, recipeId: row.recipeId }
}

interface RecipeForCooking {
  id: string
  servingsBase: number
  kcalPerServing: number | null
  ingredients: ReturnType<typeof toIngredient>[]
}

async function loadRecipe(tx: Db, householdId: string, recipeId: string): Promise<RecipeForCooking> {
  const [recipe] = await tx
    .select({ id: schema.recipes.id, servingsBase: schema.recipes.servingsBase, kcalPerServing: schema.recipes.kcalPerServing })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, householdId)))
    .limit(1)
  if (!recipe) throw new ServiceError('not_found', 'Receta no encontrada')
  const rows = await tx.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipeId))
  return { ...recipe, ingredients: rows.map(toIngredient) }
}

// Necesidades del plato ya escalado, agregadas por alimento+unidad: dos líneas
// del mismo alimento ("200 g de cebolla" + "1 cebolla picada") se suman antes de
// tocar la despensa. Nada de aritmética a mano: el escalado es scaleRecipe.
function needsFor(recipe: RecipeForCooking, servingsCooked: number): Need[] {
  const scaled = scaleRecipe({ servingsBase: recipe.servingsBase, ingredients: recipe.ingredients }, servingsCooked)
  const byKey = new Map<string, Need>()
  for (const i of scaled.ingredients) {
    if (i.foodId === null || i.quantity === null || i.unit === null) continue
    const key = `${i.foodId}|${i.unit}`
    const acc = byKey.get(key)
    if (acc) acc.quantity += i.quantity
    else byKey.set(key, { foodId: i.foodId, quantity: i.quantity, unit: i.unit })
  }
  return Array.from(byKey.values())
}

function conversionOf(f: { defaultUnit: BaseUnit | null; gramsPerCup: number | null; gramsPerTbsp: number | null; gramsPerUnit: number | null; densityGPerMl: number | null }): FoodConversion {
  return { defaultUnit: f.defaultUnit, gramsPerCup: f.gramsPerCup, gramsPerTbsp: f.gramsPerTbsp, gramsPerUnit: f.gramsPerUnit, densityGPerMl: f.densityGPerMl }
}

interface LockedPantry {
  domain: DomainPantryItem[]
  quantityById: Map<string, number>
  nameByFoodId: Map<string, string>
}

// Paso 2 de §9.5: SELECT ... FOR UPDATE de los pantry_items del hogar cuyos
// food_id están en la receta. El ORDER BY id fija un orden de bloqueo estable:
// dos logCooked simultáneos sobre los mismos alimentos piden las filas en el
// mismo orden y se serializan en vez de interbloquearse.
// Los `foods` se leen aparte (sin FOR UPDATE): bloquear el catálogo global no
// aporta nada y lo compartirían todos los hogares.
async function lockPantry(tx: Db, householdId: string, foodIds: string[], locale: 'es' | 'en'): Promise<LockedPantry> {
  if (foodIds.length === 0) return { domain: [], quantityById: new Map(), nameByFoodId: new Map() }
  const items = await tx
    .select()
    .from(schema.pantryItems)
    .where(and(eq(schema.pantryItems.householdId, householdId), inArray(schema.pantryItems.foodId, foodIds)))
    .orderBy(schema.pantryItems.id)
    .for('update')
  const foods = await tx
    .select({
      id: schema.foods.id,
      nameEs: schema.foods.nameEs,
      nameEn: schema.foods.nameEn,
      defaultUnit: schema.foods.defaultUnit,
      gramsPerCup: schema.foods.gramsPerCup,
      gramsPerTbsp: schema.foods.gramsPerTbsp,
      gramsPerUnit: schema.foods.gramsPerUnit,
      densityGPerMl: schema.foods.densityGPerMl,
    })
    .from(schema.foods)
    .where(inArray(schema.foods.id, foodIds))
  const conversionByFood = new Map(foods.map((f) => [f.id, conversionOf(f)]))
  const nameByFoodId = new Map(foods.map((f) => [f.id, locale === 'en' ? f.nameEn : f.nameEs]))
  return {
    domain: items.map((i) => ({
      id: i.id,
      foodId: i.foodId,
      quantity: i.quantity,
      unit: i.unit,
      expiresAt: i.expiresAt ? new Date(`${i.expiresAt}T00:00:00Z`) : null,
      addedAt: i.addedAt,
      conversion: conversionByFood.get(i.foodId) ?? null,
    })),
    quantityById: new Map(items.map((i) => [i.id, i.quantity])),
    nameByFoodId,
  }
}

// Paso 4 de §9.5: una sentencia por allocation, con GREATEST(0, …) para que la
// resta sea atómica y no deje negativos, y RETURNING para saber cuánto se restó
// DE VERDAD (si otra transacción bajó la fila entre el snapshot y el UPDATE,
// deducted < requested y sale aviso). Los artículos que quedan a 0 se conservan.
async function applyAllocations(tx: Db, householdId: string, allocations: Allocation[], locked: LockedPantry, unitById: Map<string, BaseUnit>): Promise<PantryDeduction[]> {
  const deductions: PantryDeduction[] = []
  for (const a of allocations) {
    const [row] = await tx
      .update(schema.pantryItems)
      .set({ quantity: sql`GREATEST(0, ${schema.pantryItems.quantity} - ${a.quantity})` })
      .where(and(eq(schema.pantryItems.id, a.pantryItemId), eq(schema.pantryItems.householdId, householdId)))
      .returning({ quantity: schema.pantryItems.quantity })
    if (!row) continue
    const before = locked.quantityById.get(a.pantryItemId) ?? 0
    locked.quantityById.set(a.pantryItemId, row.quantity)
    deductions.push({
      pantryItemId: a.pantryItemId,
      foodId: a.foodId,
      requested: a.quantity,
      deducted: before - row.quantity,
      unit: unitById.get(a.pantryItemId) ?? 'g',
    })
  }
  return deductions
}

export async function logCooked(ctx: Ctx, input: LogCookedInput, now: Date = new Date()): Promise<CookedResult> {
  if (!input.entryId) throw new ServiceError('validation', 'Falta la entrada del plan')
  const entryId = input.entryId

  const outcome = await ctx.db.transaction(async (tx) => {
    const entry = await lockEntry(tx, ctx.householdId, entryId)
    const recipe = await loadRecipe(tx, ctx.householdId, entry.recipeId)
    const needs = needsFor(recipe, input.servingsCooked)
    const locked = await lockPantry(tx, ctx.householdId, [...new Set(needs.map((n) => n.foodId))], ctx.locale)
    const unitById = new Map(locked.domain.map((i) => [i.id, i.unit]))
    const { allocations, unmatched } = allocateDeductions(locked.domain, needs)
    const deductions = await applyAllocations(tx, ctx.householdId, allocations, locked, unitById)

    // Avisos: lo que el dominio no pudo asignar (unmatched) más lo que el UPDATE
    // restó de menos. Se expresan en la unidad de la necesidad, que es la que el
    // usuario reconoce ("faltaron 200 g de cebolla").
    const warnings: CookingWarning[] = unmatched.map((u) => ({
      foodId: u.foodId,
      name: locked.nameByFoodId.get(u.foodId) ?? '',
      requested: needs.find((n) => n.foodId === u.foodId && n.unit === u.unit)?.quantity ?? u.quantity,
      deducted: (needs.find((n) => n.foodId === u.foodId && n.unit === u.unit)?.quantity ?? u.quantity) - u.quantity,
      unit: u.unit,
    }))
    for (const d of deductions) {
      if (d.deducted >= d.requested) continue
      const need = needs.find((n) => n.foodId === d.foodId)
      if (warnings.some((w) => w.foodId === d.foodId)) continue
      warnings.push({ foodId: d.foodId, name: locked.nameByFoodId.get(d.foodId) ?? '', requested: need?.quantity ?? d.requested, deducted: d.deducted, unit: need?.unit ?? d.unit })
    }

    const [log] = await tx
      .insert(schema.cookingLog)
      .values({
        householdId: ctx.householdId,
        recipeId: recipe.id,
        entryId: entry.id,
        servingsCooked: input.servingsCooked,
        cookedAt: now,
        kcalPerServingSnapshot: recipe.kcalPerServing,
        pantryDeductions: deductions,
        warnings,
      })
      .returning({ id: schema.cookingLog.id })
    if (!log) throw new ServiceError('conflict', 'No se pudo registrar el cocinado')

    await tx
      .update(schema.recipes)
      .set({ timesCooked: sql`${schema.recipes.timesCooked} + 1`, lastCookedAt: now })
      .where(and(eq(schema.recipes.id, recipe.id), eq(schema.recipes.householdId, ctx.householdId)))

    await tx
      .update(schema.mealPlanEntries)
      .set({ cookedAt: now })
      .where(and(eq(schema.mealPlanEntries.id, entry.id), eq(schema.mealPlanEntries.householdId, ctx.householdId)))

    return {
      result: {
        logId: log.id,
        entryId: entry.id,
        recipeId: recipe.id,
        servingsCooked: input.servingsCooked,
        kcalPerServing: recipe.kcalPerServing,
        deductions,
        warnings,
        leftoverEntryId: null,
      } satisfies CookedResult,
      dates: [entry.date],
      foodIds: [...new Set(deductions.map((d) => d.foodId))],
    }
  })

  // Los eventos se emiten FUERA de la transacción: si esta se revierte, nadie
  // ha recibido un "la despensa cambió" que no ocurrió.
  emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: outcome.dates } })
  if (outcome.foodIds.length > 0) emitHouseholdEvent(ctx.householdId, { type: 'pantry.changed', payload: { foodIds: outcome.foodIds } })
  return outcome.result
}
