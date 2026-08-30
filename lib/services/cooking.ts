// El bucle de docs/01-PRODUCTO.md: cocinar descuenta de la despensa. Todo pasa
// en UNA transacción (spec §9.5) porque un descuento a medias deja la despensa
// mintiendo, y de ahí abajo miente el sistema entero.
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { aggregateNeeds, allocateDeductions, convertBase, scaleRecipe, slotForHour } from '@/lib/domain'
import type { Allocation, BaseUnit, FoodConversion, MealSlot, Need, NeedInput, PantryItem as DomainPantryItem } from '@/lib/domain'
import { invalidateHousehold } from '@/lib/cache/tags'
import { emitHouseholdEvent } from '@/lib/events/bus'
import { DEFAULT_TZ, todayIso } from '@/lib/plan-dates'
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
  slot: MealSlot
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
      leftoverOfEntryId: schema.mealPlanEntries.leftoverOfEntryId,
    })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.id, entryId), eq(schema.mealPlanEntries.householdId, householdId)))
    .limit(1)
    .for('update')
  if (!row) throw new ServiceError('not_found', 'Entrada del plan no encontrada')
  // Una sobra ya descontó la despensa el día que se cocinó el plato original
  // (§9.5 paso 7): registrarla de nuevo la duplicaría. Una sobra se come, no
  // se cocina; da igual si cooked_at sigue a null.
  if (row.leftoverOfEntryId !== null) throw new ServiceError('validation', 'Esto son sobras: la despensa ya se descontó el día que se cocinó')
  if (row.cookedAt !== null) throw new ServiceError('conflict', 'Esa comida ya está marcada como cocinada')
  // cooking_log.recipe_id es NOT NULL: una comida libre (solo custom_title) no
  // tiene ingredientes que descontar ni nutrición que registrar.
  if (row.recipeId === null) throw new ServiceError('validation', 'Esa comida no tiene receta: no hay nada que descontar')
  return { id: row.id, date: row.date, slot: row.slot, recipeId: row.recipeId }
}

// Hora local del hogar para deducir el hueco (§9.5 paso 1). DEFAULT_TZ es la
// misma constante que usa todayIso(): Date#getHours no es determinista con el
// huso horario del proceso del servidor.
export function hourInHouseholdTz(now: Date, tz = DEFAULT_TZ): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
}

// Paso 1 de §9.5: cocinar desde una receta sin hueco en el plan crea la entrada
// de hoy. El hueco lo elige el usuario si viene en `slot`; si no, se deduce de
// la hora (lib/domain/slots.ts). A partir de aquí siempre hay entrada, así que
// el resto del flujo (bloqueo, descuento, registro) es exactamente el mismo.
//
// Recibe la receta ya cargada (loadRecipe) en vez de repetir su propio SELECT:
// logCooked necesita el detalle completo (ingredientes) de todos modos, así
// que resolver la receta dos veces sería trabajo repetido sin ganar nada.
async function createEntryForRecipe(tx: Db, ctx: Ctx, recipe: RecipeForCooking, servings: number, slot: LockedEntry['slot'] | undefined, now: Date): Promise<LockedEntry> {
  const date = todayIso(undefined, now)
  const [row] = await tx
    .insert(schema.mealPlanEntries)
    .values({ householdId: ctx.householdId, date, slot: slot ?? slotForHour(hourInHouseholdTz(now)), recipeId: recipe.id, servings })
    .returning({ id: schema.mealPlanEntries.id, date: schema.mealPlanEntries.date, slot: schema.mealPlanEntries.slot })
  if (!row) throw new ServiceError('conflict', 'No se pudo crear la entrada del plan')
  return { id: row.id, date: row.date, slot: row.slot, recipeId: recipe.id }
}

// Ruling W3-R7: idempotencia SOLO en la vía "cocinar desde receta sin entrada"
// (§9.5 paso 1). Un cliente MCP/REST que repite la misma llamada (misma
// receta, mismas raciones) en menos de 5 minutos tras perder la respuesta no
// debe crear una segunda entrada de hoy ni descontar la despensa otra vez: se
// le devuelve el cocinado anterior tal cual, reconstruido desde cooking_log.
// Pasados los 5 minutos, o con otras raciones, es un cocinado nuevo de verdad.
// (La vía con entryId ya tiene su propia barandilla: lockEntry lanza 'conflict'
// si la entrada ya está cocinada — ahí SÍ se pidió mantener el conflicto tal
// cual, ver informe de la tarea 4.)
const RECIPE_REPLAY_WINDOW_MS = 5 * 60 * 1000

async function findRecipeReplay(tx: Db, householdId: string, recipeId: string, servingsCooked: number, now: Date): Promise<CookedResult | null> {
  const [lastLog] = await tx
    .select()
    .from(schema.cookingLog)
    .where(and(eq(schema.cookingLog.householdId, householdId), eq(schema.cookingLog.recipeId, recipeId), eq(schema.cookingLog.servingsCooked, servingsCooked)))
    .orderBy(desc(schema.cookingLog.cookedAt))
    .limit(1)
  if (!lastLog) return null
  if (now.getTime() - lastLog.cookedAt.getTime() > RECIPE_REPLAY_WINDOW_MS) return null
  if (lastLog.entryId === null) return null // defensivo: sin entrada no hay nada que devolver como "la entrada creada"
  const [leftover] = await tx
    .select({ id: schema.mealPlanEntries.id })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.leftoverOfEntryId, lastLog.entryId), eq(schema.mealPlanEntries.householdId, householdId)))
    .limit(1)
  return {
    logId: lastLog.id,
    entryId: lastLog.entryId,
    recipeId: lastLog.recipeId,
    servingsCooked: lastLog.servingsCooked,
    kcalPerServing: lastLog.kcalPerServingSnapshot,
    deductions: lastLog.pantryDeductions as PantryDeduction[],
    warnings: lastLog.warnings as CookingWarning[],
    leftoverEntryId: leftover?.id ?? null,
  }
}

interface RecipeForCooking {
  id: string
  servingsBase: number
  kcalPerServing: number | null
  ingredients: ReturnType<typeof toIngredient>[]
}

// Filtra recetas borradas (papelera): igual que el resto de lecturas de recipes
// (lib/services/recipes.ts), una receta en papelera no es cocinable.
async function loadRecipe(tx: Db, householdId: string, recipeId: string): Promise<RecipeForCooking> {
  const [recipe] = await tx
    .select({ id: schema.recipes.id, servingsBase: schema.recipes.servingsBase, kcalPerServing: schema.recipes.kcalPerServing })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, householdId), isNull(schema.recipes.deletedAt)))
    .limit(1)
  if (!recipe) throw new ServiceError('not_found', 'Receta no encontrada')
  const rows = await tx.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipeId))
  return { ...recipe, ingredients: rows.map(toIngredient) }
}

function conversionOf(f: { defaultUnit: BaseUnit | null; gramsPerCup: number | null; gramsPerTbsp: number | null; gramsPerUnit: number | null; densityGPerMl: number | null }): FoodConversion {
  return { defaultUnit: f.defaultUnit, gramsPerCup: f.gramsPerCup, gramsPerTbsp: f.gramsPerTbsp, gramsPerUnit: f.gramsPerUnit, densityGPerMl: f.densityGPerMl }
}

interface FoodInfo {
  conversionByFoodId: Map<string, FoodConversion>
  nameByFoodId: Map<string, string>
}

// Conversión y nombre (en ctx.locale) de los alimentos implicados. Sin lock: el
// catálogo de alimentos es global y compartido por todos los hogares; bloquearlo
// no aporta nada y solo entorpecería a otro hogar cocinando a la vez.
async function loadFoodInfo(tx: Db, foodIds: string[], locale: 'es' | 'en'): Promise<FoodInfo> {
  if (foodIds.length === 0) return { conversionByFoodId: new Map(), nameByFoodId: new Map() }
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
  return {
    conversionByFoodId: new Map(foods.map((f) => [f.id, conversionOf(f)])),
    nameByFoodId: new Map(foods.map((f) => [f.id, locale === 'en' ? f.nameEn : f.nameEs])),
  }
}

// Necesidades del plato ya escalado (dominio: scaleRecipe + aggregateNeeds). Dos
// líneas del mismo alimento ("200 g de cebolla" + "1 cebolla picada") se funden
// en una sola Need, convirtiendo entre unidades cuando la conversión lo permite
// (regla W1-R17). Nada de aritmética a mano en el servicio: el escalado y la
// agregación son funciones puras de lib/domain.
function scaledNeeds(recipe: RecipeForCooking, servingsCooked: number, conversionByFoodId: Map<string, FoodConversion>): Need[] {
  const scaled = scaleRecipe({ servingsBase: recipe.servingsBase, ingredients: recipe.ingredients }, servingsCooked)
  const lines: NeedInput[] = []
  for (const i of scaled.ingredients) {
    if (i.foodId === null || i.quantity === null || i.unit === null) continue
    lines.push({ foodId: i.foodId, quantity: i.quantity, unit: i.unit, conversion: conversionByFoodId.get(i.foodId) ?? null })
  }
  return aggregateNeeds(lines)
}

// Paso 2 de §9.5: SELECT ... FOR UPDATE de los pantry_items del hogar cuyos
// food_id están en la receta. El ORDER BY id fija un orden de bloqueo estable:
// dos logCooked simultáneos sobre los mismos alimentos piden las filas en el
// mismo orden y se serializan en vez de interbloquearse.
async function lockPantryItems(tx: Db, householdId: string, foodIds: string[], conversionByFoodId: Map<string, FoodConversion>): Promise<DomainPantryItem[]> {
  if (foodIds.length === 0) return []
  const items = await tx
    .select()
    .from(schema.pantryItems)
    .where(and(eq(schema.pantryItems.householdId, householdId), inArray(schema.pantryItems.foodId, foodIds)))
    .orderBy(schema.pantryItems.id)
    .for('update')
  return items.map((i) => ({
    id: i.id,
    foodId: i.foodId,
    quantity: i.quantity,
    unit: i.unit,
    expiresAt: i.expiresAt ? new Date(`${i.expiresAt}T00:00:00Z`) : null,
    addedAt: i.addedAt,
    conversion: conversionByFoodId.get(i.foodId) ?? null,
  }))
}

interface DeductionOutcome {
  deduction: PantryDeduction
  // La fila terminó exactamente a 0: solo entonces GREATEST(0, …) pudo haber
  // recortado de verdad lo pedido. Si no, cualquier diferencia entre `requested`
  // (el número JS sin redondear) y `deducted` (el RETURNING, numeric(12,3)) es
  // ruido de precisión de columna, no un faltante real.
  exhausted: boolean
}

// Paso 4 de §9.5: una sentencia por allocation, con GREATEST(0, …) para que la
// resta sea atómica y no deje negativos, y RETURNING para saber cuánto se restó
// DE VERDAD. Los artículos que quedan a 0 se conservan.
async function applyAllocations(tx: Db, householdId: string, allocations: Allocation[], quantityById: Map<string, number>, unitById: Map<string, BaseUnit>): Promise<DeductionOutcome[]> {
  const outcomes: DeductionOutcome[] = []
  for (const a of allocations) {
    const [row] = await tx
      .update(schema.pantryItems)
      .set({ quantity: sql`GREATEST(0, ${schema.pantryItems.quantity} - ${a.quantity})` })
      .where(and(eq(schema.pantryItems.id, a.pantryItemId), eq(schema.pantryItems.householdId, householdId)))
      .returning({ quantity: schema.pantryItems.quantity })
    // El artículo estaba bloqueado con FOR UPDATE en la misma transacción: si no
    // aparece aquí es una inconsistencia interna, no un caso de uso esperado.
    if (!row) throw new ServiceError('conflict', 'No se pudo descontar el artículo de despensa')
    const unit = unitById.get(a.pantryItemId)
    if (unit === undefined) throw new ServiceError('conflict', 'Inconsistencia interna de despensa')
    const before = quantityById.get(a.pantryItemId) ?? 0
    quantityById.set(a.pantryItemId, row.quantity)
    outcomes.push({
      deduction: { pantryItemId: a.pantryItemId, foodId: a.foodId, requested: a.quantity, deducted: before - row.quantity, unit },
      exhausted: row.quantity === 0,
    })
  }
  return outcomes
}

// Tolerancia de escritura: pantry_items.quantity es numeric(12,3), así que el
// UPDATE redondea a 3 decimales. Una cantidad escalada de forma no lineal
// (ratio^0.65) puede tener más decimales que eso: la diferencia entre lo pedido
// (número JS sin redondear) y lo realmente restado (RETURNING redondeado) es
// ruido de columna, no un faltante que avisar.
const STORAGE_EPSILON = 1e-3

// Avisos: lo que el dominio no pudo asignar en absoluto (unmatched) más lo que
// el UPDATE recortó de verdad porque el artículo se vació (exhausted). Se
// agregan por `foodId|unit de la necesidad` para que un déficit repartido entre
// varios artículos salga como un único aviso, y se convierten siempre a la
// unidad de la NECESIDAD (la que el usuario reconoce, "faltaron 200 g de cebolla"),
// nunca a la del artículo de despensa que causó el recorte.
// Exportada solo para test: un `exhausted` con hueco real entre `requested` y
// `deducted` exige antes una operación imposible en columnas numeric(12,3) (el
// margen de coma flotante que deja una conversión de unidad ronda 1e-7, muy
// por debajo de STORAGE_EPSILON) o una carrera real entre dos logCooked, así
// que probar la atribución correcta con dos needs incompatibles pasa por
// llamar a esta función pura directamente en vez de reproducirla con Postgres.
export function buildWarnings(needs: Need[], unmatched: Need[], outcomes: DeductionOutcome[], conversionByFoodId: Map<string, FoodConversion>, nameByFoodId: Map<string, string>): CookingWarning[] {
  const deficitByKey = new Map<string, number>()
  for (const u of unmatched) {
    const key = `${u.foodId}|${u.unit}`
    deficitByKey.set(key, (deficitByKey.get(key) ?? 0) + u.quantity)
  }
  for (const { deduction: d, exhausted } of outcomes) {
    if (!exhausted) continue
    const shortfall = d.requested - d.deducted
    if (shortfall <= STORAGE_EPSILON) continue
    const conversion = conversionByFoodId.get(d.foodId) ?? null
    // Del alimento puede haber varios needs en unidades distintas (p. ej. uno
    // en gramos y otro en unidades, sin gramsPerUnit que los relacione): solo
    // vale el que convertBase pueda alcanzar de verdad desde la unidad del
    // artículo de despensa. Sin fallback: mezclar unidades a ciegas es lo que
    // producía un `deducted` negativo.
    const need = needs.find((n) => n.foodId === d.foodId && convertBase(shortfall, d.unit, n.unit, conversion) !== null)
    if (!need) continue
    const shortfallInNeedUnit = convertBase(shortfall, d.unit, need.unit, conversion)
    if (shortfallInNeedUnit === null) continue
    const key = `${need.foodId}|${need.unit}`
    deficitByKey.set(key, (deficitByKey.get(key) ?? 0) + shortfallInNeedUnit)
  }
  const needByKey = new Map(needs.map((n) => [`${n.foodId}|${n.unit}`, n]))
  const warnings: CookingWarning[] = []
  for (const [key, deficit] of deficitByKey) {
    if (deficit <= STORAGE_EPSILON) continue
    const need = needByKey.get(key)
    if (!need) continue
    warnings.push({ foodId: need.foodId, name: nameByFoodId.get(need.foodId) ?? '', requested: need.quantity, deducted: need.quantity - deficit, unit: need.unit })
  }
  return warnings
}

export async function logCooked(ctx: Ctx, input: LogCookedInput, now: Date = new Date()): Promise<CookedResult> {
  const outcome = await ctx.db.transaction(async (tx) => {
    // Paso 1 de §9.5: con entryId se bloquea la entrada existente; sin él, se
    // cocina "a pelo" desde una receta y se crea la entrada de hoy (comprobando
    // antes la barandilla de idempotencia W3-R7). El esquema de validación
    // (lib/validation/cooking.ts) ya garantiza que al menos uno de los dos
    // viene informado; la comprobación de recipeId aquí es solo la guarda de
    // tipos que TypeScript no puede deducir del refine de zod.
    let entry: LockedEntry
    let recipe: RecipeForCooking
    if (input.entryId) {
      entry = await lockEntry(tx, ctx.householdId, input.entryId)
      recipe = await loadRecipe(tx, ctx.householdId, entry.recipeId)
    } else {
      if (!input.recipeId) throw new ServiceError('validation', 'Falta la receta o la entrada del plan')
      const replay = await findRecipeReplay(tx, ctx.householdId, input.recipeId, input.servingsCooked, now)
      if (replay) return { result: replay, dates: [], foodIds: [], replay: true }
      recipe = await loadRecipe(tx, ctx.householdId, input.recipeId)
      entry = await createEntryForRecipe(tx, ctx, recipe, input.servingsCooked, input.slot, now)
    }
    const foodIds = [...new Set(recipe.ingredients.map((i) => i.foodId).filter((id): id is string => id !== null))]
    const { conversionByFoodId, nameByFoodId } = await loadFoodInfo(tx, foodIds, ctx.locale)
    const needs = scaledNeeds(recipe, input.servingsCooked, conversionByFoodId)
    const pantryItems = await lockPantryItems(tx, ctx.householdId, foodIds, conversionByFoodId)
    const quantityById = new Map(pantryItems.map((i) => [i.id, i.quantity]))
    const unitById = new Map(pantryItems.map((i) => [i.id, i.unit]))
    const { allocations, unmatched } = allocateDeductions(pantryItems, needs)
    const outcomes = await applyAllocations(tx, ctx.householdId, allocations, quantityById, unitById)
    const deductions = outcomes.map((o) => o.deduction)
    const warnings = buildWarnings(needs, unmatched, outcomes, conversionByFoodId, nameByFoodId)

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

    // Paso 7 de §9.5: la sobra es una comida planificable más, ligada a la
    // entrada original, que no genera compra (consolidateNeeds la excluye por
    // leftover_of_entry_id). Se queda en 'planned': aún no se ha comido.
    let leftoverEntryId: string | null = null
    const dates = [entry.date]
    if (input.leftovers) {
      const [leftover] = await tx
        .insert(schema.mealPlanEntries)
        .values({
          householdId: ctx.householdId,
          date: input.leftovers.date,
          slot: input.leftovers.slot,
          recipeId: recipe.id,
          servings: input.leftovers.servings,
          leftoverOfEntryId: entry.id,
        })
        .returning({ id: schema.mealPlanEntries.id })
      if (!leftover) throw new ServiceError('conflict', 'No se pudo crear la sobra')
      leftoverEntryId = leftover.id
      if (input.leftovers.date !== entry.date) dates.push(input.leftovers.date)
    }

    return {
      result: {
        logId: log.id,
        entryId: entry.id,
        recipeId: recipe.id,
        servingsCooked: input.servingsCooked,
        kcalPerServing: recipe.kcalPerServing,
        deductions,
        warnings,
        leftoverEntryId,
      } satisfies CookedResult,
      dates,
      foodIds: [...new Set(deductions.map((d) => d.foodId))],
      replay: false,
    }
  })

  // Una respuesta "replay" (W3-R7) no cambió nada: ni plan, ni despensa, ni
  // receta. Emitir esos eventos sería mentir sobre un cambio que no ocurrió.
  if (!outcome.replay) {
    // Los eventos se emiten FUERA de la transacción: si esta se revierte, nadie
    // ha recibido un "la despensa cambió" que no ocurrió.
    emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: outcome.dates } })
    invalidateHousehold(ctx.householdId, ['plan'])
    if (outcome.foodIds.length > 0) {
      emitHouseholdEvent(ctx.householdId, { type: 'pantry.changed', payload: { foodIds: outcome.foodIds } })
      invalidateHousehold(ctx.householdId, ['pantry'])
    }
    // Ruling W3-R2: times_cooked/last_cooked_at cambiaron, así que la receta también avisa.
    emitHouseholdEvent(ctx.householdId, { type: 'recipe.changed', payload: { recipeId: outcome.result.recipeId } })
    invalidateHousehold(ctx.householdId, ['recipes'])
  }
  return outcome.result
}

export interface CookingLogEntry {
  id: string
  recipeId: string
  title: string
  entryId: string | null
  servingsCooked: number
  cookedAt: string
  kcalPerServing: number | null
  warnings: CookingWarning[]
  warningCount: number
}

// Historial de cocinados del hogar, del más reciente al más antiguo. Lo usan la
// pantalla Hoy (pista b) y el recurso household://context (pista d).
export async function listCookingLog(ctx: Ctx, limit: number): Promise<CookingLogEntry[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ServiceError('validation', 'limit debe ser un entero entre 1 y 100')
  const rows = await ctx.db
    .select({
      id: schema.cookingLog.id,
      recipeId: schema.cookingLog.recipeId,
      title: schema.recipes.title,
      entryId: schema.cookingLog.entryId,
      servingsCooked: schema.cookingLog.servingsCooked,
      cookedAt: schema.cookingLog.cookedAt,
      kcalPerServing: schema.cookingLog.kcalPerServingSnapshot,
      warnings: schema.cookingLog.warnings,
    })
    .from(schema.cookingLog)
    .innerJoin(schema.recipes, and(eq(schema.recipes.id, schema.cookingLog.recipeId), eq(schema.recipes.householdId, ctx.householdId)))
    .where(eq(schema.cookingLog.householdId, ctx.householdId))
    // Desempate por id: dos cocinados con el mismo cooked_at (mismo `now`
    // inyectado, por ejemplo en tests) no deben salir en orden indefinido.
    .orderBy(desc(schema.cookingLog.cookedAt), desc(schema.cookingLog.id))
    .limit(limit)
  return rows.map((r) => {
    const warnings = (Array.isArray(r.warnings) ? r.warnings : []) as CookingWarning[]
    return {
      id: r.id,
      recipeId: r.recipeId,
      title: r.title,
      entryId: r.entryId,
      servingsCooked: r.servingsCooked,
      cookedAt: r.cookedAt.toISOString(),
      kcalPerServing: r.kcalPerServing,
      warnings,
      warningCount: warnings.length,
    }
  })
}
