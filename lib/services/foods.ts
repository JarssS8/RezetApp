import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { normalizeSearchName } from '@/lib/domain/quantities'
import type { BaseUnit, FoodNutrition, Locale } from '@/lib/domain/types'
import type { Ctx } from './ctx'

export interface FoodSummary {
  id: string
  householdId: string | null // null = global (seed)
  name: string // nameEs o nameEn según ctx.locale
  nameEs: string
  nameEn: string
  defaultUnit: BaseUnit
  kcal100g: number | null
  isEstimated: boolean
  source: 'off' | 'usda' | 'manual' | 'ai'
  allergens: string[]
}
export type FoodWithNutrition = FoodSummary & FoodNutrition

export type ResolveMethod = 'exact' | 'alias' | 'trigram'
export interface ResolvedFood {
  foodId: string
  method: ResolveMethod
  score: number
  name: string
}

// Umbral de la cascada §9.4 (b): trigram ≥ 0.6 para resolver un nombre suelto
const TRIGRAM_RESOLVE = 0.6
// Umbral, más laxo, para sugerencias de búsqueda libre (no es una resolución automática)
const TRIGRAM_SEARCH = 0.25

// Visible para el hogar: global (household_id NULL) o propio, y no fusionado en otro (Task 3: merge)
function visible(ctx: Ctx) {
  return and(or(isNull(schema.foods.householdId), eq(schema.foods.householdId, ctx.householdId)), isNull(schema.foods.mergedIntoId))
}

function searchColumn(locale: Locale) {
  return locale === 'en' ? schema.foods.searchNameEn : schema.foods.searchNameEs
}

function nameColumn(locale: Locale) {
  return locale === 'en' ? schema.foods.nameEn : schema.foods.nameEs
}

function toSummary(f: schema.Food, locale: Locale): FoodWithNutrition {
  return {
    id: f.id,
    householdId: f.householdId,
    name: locale === 'en' ? f.nameEn : f.nameEs,
    nameEs: f.nameEs,
    nameEn: f.nameEn,
    defaultUnit: f.defaultUnit,
    kcal100g: f.kcal100g,
    isEstimated: f.isEstimated,
    source: f.source,
    allergens: f.allergens,
    protein100g: f.protein100g,
    carbs100g: f.carbs100g,
    fat100g: f.fat100g,
    fiber100g: f.fiber100g,
    gramsPerCup: f.gramsPerCup,
    gramsPerTbsp: f.gramsPerTbsp,
    gramsPerUnit: f.gramsPerUnit,
    densityGPerMl: f.densityGPerMl,
  }
}

// Búsqueda libre: coincide por trigram en el nombre del idioma pedido, el otro
// idioma o cualquier alias (los alias se guardan ya normalizados, ver Task 3).
export async function searchFoods(ctx: Ctx, input: { q: string; locale?: Locale; limit?: number; offset?: number }): Promise<FoodSummary[]> {
  const locale = input.locale ?? ctx.locale
  const q = normalizeSearchName(input.q)
  if (!q) return []
  const simEs = sql<number>`similarity(${schema.foods.searchNameEs}, ${q})`
  const simEn = sql<number>`similarity(${schema.foods.searchNameEn}, ${q})`
  const simAlias = sql<number>`coalesce((select max(similarity(a, ${q})) from unnest(${schema.foods.aliases}) a), 0)`
  const sim = sql<number>`greatest(${simEs}, ${simEn}, ${simAlias})`
  const rows = await ctx.db
    .select({ f: schema.foods, sim })
    .from(schema.foods)
    .where(and(visible(ctx), sql`(${simEs} >= ${TRIGRAM_SEARCH} or ${simEn} >= ${TRIGRAM_SEARCH} or ${simAlias} >= ${TRIGRAM_SEARCH})`))
    // el alimento del hogar antes que el global en empate; luego similitud; luego nombre
    .orderBy(sql`(${schema.foods.householdId} is null)`, desc(sim), nameColumn(locale))
    .limit(input.limit ?? 20)
    .offset(input.offset ?? 0)
  return rows.map((r) => toSummary(r.f, locale))
}

// Cascada de resolución §9.4: (a) exacto por nombre normalizado o alias, (b) trigram ≥ 0.6.
// El resto de la cascada (código de barras OFF, IA) vive en Task 3 / pista (e); la corrección manual siempre gana.
export async function resolveFoodName(ctx: Ctx, foodName: string, locale: Locale): Promise<ResolvedFood | null> {
  const q = normalizeSearchName(foodName)
  if (!q) return null
  const col = searchColumn(locale)
  const nameCol = nameColumn(locale)

  const exact = await ctx.db
    .select({ id: schema.foods.id, name: nameCol })
    .from(schema.foods)
    .where(and(visible(ctx), eq(col, q)))
    .orderBy(sql`(${schema.foods.householdId} is null)`)
    .limit(1)
  if (exact[0]) return { foodId: exact[0].id, method: 'exact', score: 1, name: exact[0].name }

  // Alias: se guardan ya normalizados (Task 3), así que basta comparar en minúsculas
  const alias = await ctx.db
    .select({ id: schema.foods.id, name: nameCol })
    .from(schema.foods)
    .where(and(visible(ctx), sql`exists (select 1 from unnest(${schema.foods.aliases}) a where lower(a) = ${q})`))
    .orderBy(sql`(${schema.foods.householdId} is null)`)
    .limit(1)
  if (alias[0]) return { foodId: alias[0].id, method: 'alias', score: 0.95, name: alias[0].name }

  const sim = sql<number>`similarity(${col}, ${q})`
  const trigram = await ctx.db
    .select({ id: schema.foods.id, name: nameCol, sim })
    .from(schema.foods)
    .where(and(visible(ctx), sql`${sim} >= ${TRIGRAM_RESOLVE}`))
    .orderBy(desc(sim), sql`(${schema.foods.householdId} is null)`)
    .limit(1)
  if (trigram[0]) return { foodId: trigram[0].id, method: 'trigram', score: trigram[0].sim, name: trigram[0].name }

  return null
}

// Resuelve varios nombres a la vez conservando orden y nulls. Una consulta por nombre
// (la cascada de resolveFoodName no es trivial de batchear sin perder precisión),
// pero acotado al tamaño de la lista de ingredientes de una receta: nunca N+1 sin límite.
export async function resolveMany(ctx: Ctx, names: string[], locale: Locale): Promise<(ResolvedFood | null)[]> {
  const out: (ResolvedFood | null)[] = []
  for (const name of names) out.push(await resolveFoodName(ctx, name, locale))
  return out
}

export async function getFoodsNutrition(ctx: Ctx, foodIds: string[]): Promise<Map<string, FoodWithNutrition>> {
  const map = new Map<string, FoodWithNutrition>()
  if (foodIds.length === 0) return map
  const rows = await ctx.db
    .select()
    .from(schema.foods)
    .where(and(visible(ctx), inArray(schema.foods.id, foodIds)))
  for (const f of rows) map.set(f.id, toSummary(f, ctx.locale))
  return map
}

export async function getFood(ctx: Ctx, foodId: string): Promise<FoodWithNutrition | null> {
  const [f] = await ctx.db
    .select()
    .from(schema.foods)
    .where(and(visible(ctx), eq(schema.foods.id, foodId)))
    .limit(1)
  return f ? toSummary(f, ctx.locale) : null
}
