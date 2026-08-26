import { and, eq, lte, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { emitHouseholdEvent } from '@/lib/events/bus'
import { expiringSoon } from '@/lib/domain/pantry'
import { normalizeSearchName } from '@/lib/domain/quantities'
import type { BaseUnit, Locale, PantryItem as DomainPantryItem } from '@/lib/domain/types'
import type { PantryAdjust, PantryItemInput, PantryQuery } from '@/lib/validation/pantry'
import { getFoodsNutrition, type FoodWithNutrition } from './foods'
import { ServiceError, type Ctx } from './ctx'

const DAY_MS = 86_400_000

export interface PantryRow {
  id: string
  foodId: string
  name: string
  quantity: number
  unit: BaseUnit
  location: 'fridge' | 'freezer' | 'pantry'
  expiresAt: string | null
  openedAt: string | null
  addedAt: string
  daysToExpiry: number | null
  food: FoodWithNutrition
}

function nameColumn(locale: Locale) {
  return locale === 'en' ? schema.foods.nameEn : schema.foods.nameEs
}

function searchNameColumn(locale: Locale) {
  return locale === 'en' ? schema.foods.searchNameEn : schema.foods.searchNameEs
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function daysUntil(expiresAt: string | null, today: Date): number | null {
  if (!expiresAt) return null
  return Math.ceil((Date.parse(expiresAt) - startOfDay(today)) / DAY_MS)
}

function toConversion(food: FoodWithNutrition) {
  return { defaultUnit: food.defaultUnit, gramsPerCup: food.gramsPerCup, gramsPerTbsp: food.gramsPerTbsp, gramsPerUnit: food.gramsPerUnit, densityGPerMl: food.densityGPerMl }
}

function toPantryRow(item: schema.PantryItemRow, food: FoodWithNutrition, today: Date): PantryRow {
  return {
    id: item.id,
    foodId: item.foodId,
    name: food.name,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    expiresAt: item.expiresAt,
    openedAt: item.openedAt ? item.openedAt.toISOString() : null,
    addedAt: item.addedAt.toISOString(),
    daysToExpiry: daysUntil(item.expiresAt, today),
    food,
  }
}

function toDomainItem(item: schema.PantryItemRow, food: FoodWithNutrition): DomainPantryItem {
  return {
    id: item.id,
    foodId: item.foodId,
    quantity: item.quantity,
    unit: item.unit,
    expiresAt: item.expiresAt ? new Date(`${item.expiresAt}T00:00:00Z`) : null,
    addedAt: item.addedAt,
    conversion: toConversion(food),
  }
}

// Un ítem cuya comida ya no es visible (fusionada, o privada de otro hogar tras
// un cambio de propietario) sería una inconsistencia de datos, no un caso de
// uso esperado: se lanza en vez de devolver una fila a medias.
async function loadRowsForHousehold(ctx: Ctx): Promise<{ item: schema.PantryItemRow; food: FoodWithNutrition }[]> {
  const items = await ctx.db.select().from(schema.pantryItems).where(eq(schema.pantryItems.householdId, ctx.householdId))
  const foodsMap = await getFoodsNutrition(ctx, [...new Set(items.map((i) => i.foodId))])
  return items.map((item) => {
    const food = foodsMap.get(item.foodId)
    if (!food) throw new ServiceError('conflict', 'Alimento no visible para un artículo de despensa existente')
    return { item, food }
  })
}

// Orden: ubicación, caducidad ascendente con los sin fecha al final, nombre.
export async function listPantry(ctx: Ctx, query: PantryQuery): Promise<PantryRow[]> {
  const today = new Date()
  const conditions = [eq(schema.pantryItems.householdId, ctx.householdId)]
  if (query.location) conditions.push(eq(schema.pantryItems.location, query.location))
  if (query.expiresBefore) conditions.push(lte(schema.pantryItems.expiresAt, query.expiresBefore))
  if (query.q) {
    const q = normalizeSearchName(query.q)
    const col = searchNameColumn(ctx.locale)
    const sim = sql<number>`similarity(${col}, ${q})`
    conditions.push(or(sql`${sim} >= 0.25`, sql`${col} LIKE ${`${q}%`}`)!)
  }

  const rows = await ctx.db
    .select({ item: schema.pantryItems })
    .from(schema.pantryItems)
    .innerJoin(schema.foods, eq(schema.pantryItems.foodId, schema.foods.id))
    .where(and(...conditions))
    .orderBy(schema.pantryItems.location, sql`${schema.pantryItems.expiresAt} asc nulls last`, nameColumn(ctx.locale))

  const items = rows.map((r) => r.item)
  const foodsMap = await getFoodsNutrition(ctx, [...new Set(items.map((i) => i.foodId))])
  return items.map((item) => {
    const food = foodsMap.get(item.foodId)
    if (!food) throw new ServiceError('conflict', 'Alimento no visible para un artículo de despensa existente')
    return toPantryRow(item, food, today)
  })
}

export async function upsertPantryItem(ctx: Ctx, input: PantryItemInput & { id?: string }): Promise<PantryRow> {
  const foodsMap = await getFoodsNutrition(ctx, [input.foodId])
  const food = foodsMap.get(input.foodId)
  if (!food) throw new ServiceError('validation', 'Alimento no válido')

  const values: typeof schema.pantryItems.$inferInsert = {
    householdId: ctx.householdId,
    foodId: input.foodId,
    quantity: input.quantity,
    unit: input.unit,
    location: input.location,
    expiresAt: input.expiresAt ?? null,
    openedAt: input.openedAt ? new Date(input.openedAt) : null,
  }

  let row: schema.PantryItemRow | undefined
  if (input.id) {
    ;[row] = await ctx.db
      .update(schema.pantryItems)
      .set(values)
      .where(and(eq(schema.pantryItems.id, input.id), eq(schema.pantryItems.householdId, ctx.householdId)))
      .returning()
    if (!row) throw new ServiceError('not_found', 'Artículo no encontrado')
  } else {
    ;[row] = await ctx.db.insert(schema.pantryItems).values(values).returning()
    if (!row) throw new ServiceError('conflict', 'No se pudo crear el artículo')
  }

  emitHouseholdEvent(ctx.householdId, { type: 'pantry.changed', payload: { foodIds: [row.foodId] } })
  return toPantryRow(row, food, new Date())
}

// Ajuste atómico en una sola sentencia: el UPDATE ... RETURNING evita el read-modify-write
// que perdería incrementos bajo concurrencia (dos cocciones a la vez, por ejemplo).
export async function adjustPantryItem(ctx: Ctx, input: PantryAdjust): Promise<PantryRow> {
  const [row] = await ctx.db
    .update(schema.pantryItems)
    .set({ quantity: sql`GREATEST(0, ${schema.pantryItems.quantity} + ${input.delta})` })
    .where(and(eq(schema.pantryItems.id, input.itemId), eq(schema.pantryItems.householdId, ctx.householdId)))
    .returning()
  if (!row) throw new ServiceError('not_found', 'Artículo no encontrado')
  emitHouseholdEvent(ctx.householdId, { type: 'pantry.changed', payload: { foodIds: [row.foodId] } })

  const foodsMap = await getFoodsNutrition(ctx, [row.foodId])
  const food = foodsMap.get(row.foodId)
  if (!food) throw new ServiceError('conflict', 'Alimento no visible para un artículo de despensa existente')
  return toPantryRow(row, food, new Date())
}

export async function removePantryItem(ctx: Ctx, id: string): Promise<void> {
  const [row] = await ctx.db
    .delete(schema.pantryItems)
    .where(and(eq(schema.pantryItems.id, id), eq(schema.pantryItems.householdId, ctx.householdId)))
    .returning()
  if (!row) throw new ServiceError('not_found', 'Artículo no encontrado')
  emitHouseholdEvent(ctx.householdId, { type: 'pantry.changed', payload: { foodIds: [row.foodId] } })
}

// Una sola consulta a pantry_items (más el lote de nutrición) para todo el hogar,
// y el filtro de "qué caduca pronto" en dominio (expiringSoon), puro y testeado.
export async function expiringPantry(ctx: Ctx, days: number, today: Date = new Date()): Promise<PantryRow[]> {
  const rows = await loadRowsForHousehold(ctx)
  const byId = new Map(rows.map((r) => [r.item.id, r]))
  const domainItems = rows.map(({ item, food }) => toDomainItem(item, food))
  const expiring = expiringSoon(domainItems, today, days)
  return expiring.map((d) => {
    const row = byId.get(d.id)
    if (!row) throw new ServiceError('conflict', 'Inconsistencia interna de despensa')
    return toPantryRow(row.item, row.food, today)
  })
}

// Forma de dominio para consolidateNeeds / allocateDeductions (W3): sin campos de presentación.
export async function pantryAsDomain(ctx: Ctx): Promise<DomainPantryItem[]> {
  const rows = await loadRowsForHousehold(ctx)
  return rows.map(({ item, food }) => toDomainItem(item, food))
}
