import { and, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { emitHouseholdEvent } from '@/lib/events/bus'
import { aggregateNutrition, EMPTY_MACROS, entryStatus } from '@/lib/domain'
import type { Nutrition } from '@/lib/domain'
import type { MealSlot, PlanBatch, PlanEntryMove, PlanEntryPatch } from '@/lib/validation/plan'
import { type Ctx, type Db, ServiceError } from './ctx'

export interface PlanEntryView {
  id: string
  date: string
  slot: MealSlot
  recipeId: string | null
  title: string
  servings: number
  leftoverOfEntryId: string | null
  timeBudgetMinutes: number | null
  status: 'planned' | 'cooked' | 'skipped'
  sortOrder: number
  kcalPerServing: number | null
  totalMinutes: number | null
  imageUrl: string | null
}

// Columnas comunes para reconstruir una PlanEntryView: entrada + receta (si tiene)
const entryColumns = {
  id: schema.mealPlanEntries.id,
  date: schema.mealPlanEntries.date,
  slot: schema.mealPlanEntries.slot,
  recipeId: schema.mealPlanEntries.recipeId,
  customTitle: schema.mealPlanEntries.customTitle,
  servings: schema.mealPlanEntries.servings,
  leftoverOfEntryId: schema.mealPlanEntries.leftoverOfEntryId,
  timeBudgetMinutes: schema.mealPlanEntries.timeBudgetMinutes,
  cookedAt: schema.mealPlanEntries.cookedAt,
  skippedAt: schema.mealPlanEntries.skippedAt,
  sortOrder: schema.mealPlanEntries.sortOrder,
  recipeTitle: schema.recipes.title,
  kcalPerServing: schema.recipes.kcalPerServing,
  prepMinutes: schema.recipes.prepMinutes,
  cookMinutes: schema.recipes.cookMinutes,
  imageUrls: schema.recipes.imageUrls,
} as const

type EntryRow = {
  id: string
  date: string
  slot: string
  recipeId: string | null
  customTitle: string | null
  servings: number
  leftoverOfEntryId: string | null
  timeBudgetMinutes: number | null
  cookedAt: Date | null
  skippedAt: Date | null
  sortOrder: number
  recipeTitle: string | null
  kcalPerServing: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  imageUrls: string[] | null
}

function toView(r: EntryRow): PlanEntryView {
  const totalMinutes = r.prepMinutes !== null || r.cookMinutes !== null ? (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) : null
  const imageUrl = r.imageUrls && r.imageUrls.length > 0 ? (r.imageUrls[0] ?? null) : null
  return {
    id: r.id,
    date: r.date,
    slot: r.slot as MealSlot,
    recipeId: r.recipeId,
    title: r.recipeTitle ?? r.customTitle ?? '',
    servings: r.servings,
    leftoverOfEntryId: r.leftoverOfEntryId,
    timeBudgetMinutes: r.timeBudgetMinutes,
    status: entryStatus({ cookedAt: r.cookedAt, skippedAt: r.skippedAt }),
    sortOrder: r.sortOrder,
    kcalPerServing: r.kcalPerServing,
    totalMinutes,
    imageUrl,
  }
}

async function queryEntryViews(db: Db, where: SQL | undefined): Promise<PlanEntryView[]> {
  const rows = await db
    .select(entryColumns)
    .from(schema.mealPlanEntries)
    .leftJoin(schema.recipes, eq(schema.recipes.id, schema.mealPlanEntries.recipeId))
    .where(where)
    .orderBy(schema.mealPlanEntries.date, schema.mealPlanEntries.slot, schema.mealPlanEntries.sortOrder)
  return rows.map(toView)
}

async function requireEntryView(db: Db, householdId: string, id: string): Promise<PlanEntryView> {
  const [view] = await queryEntryViews(db, and(eq(schema.mealPlanEntries.householdId, householdId), eq(schema.mealPlanEntries.id, id)))
  if (!view) throw new ServiceError('not_found', 'Entrada del plan no encontrada')
  return view
}

// Entradas del hogar en un rango de fechas (inclusive), ordenadas por fecha/hueco/orden manual
export async function listEntries(ctx: Ctx, range: { from: string; to: string }): Promise<PlanEntryView[]> {
  return queryEntryViews(
    ctx.db,
    and(eq(schema.mealPlanEntries.householdId, ctx.householdId), gte(schema.mealPlanEntries.date, range.from), lte(schema.mealPlanEntries.date, range.to)),
  )
}

// Alta y baja de entradas en una sola transacción; los ids de `remove` de otro hogar se ignoran sin error
export async function applyBatch(ctx: Ctx, batch: PlanBatch): Promise<{ added: PlanEntryView[]; removed: string[] }> {
  const { addedIds, removed, dates } = await ctx.db.transaction(async (tx) => {
    const dates = new Set<string>()
    let removed: string[] = []
    if (batch.remove.length > 0) {
      const rows = await tx
        .delete(schema.mealPlanEntries)
        .where(and(eq(schema.mealPlanEntries.householdId, ctx.householdId), inArray(schema.mealPlanEntries.id, batch.remove)))
        .returning({ id: schema.mealPlanEntries.id, date: schema.mealPlanEntries.date })
      removed = rows.map((r) => r.id)
      for (const r of rows) dates.add(r.date)
    }
    const addedIds: string[] = []
    for (const item of batch.add) {
      if (item.recipeId) {
        const [recipe] = await tx
          .select({ id: schema.recipes.id })
          .from(schema.recipes)
          .where(and(eq(schema.recipes.id, item.recipeId), eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
          .limit(1)
        if (!recipe) throw new ServiceError('validation', 'La receta no pertenece al hogar')
      }
      const [row] = await tx
        .insert(schema.mealPlanEntries)
        .values({
          householdId: ctx.householdId,
          date: item.date,
          slot: item.slot,
          recipeId: item.recipeId ?? null,
          customTitle: item.customTitle ?? null,
          servings: item.servings,
          leftoverOfEntryId: item.leftoverOfEntryId ?? null,
          timeBudgetMinutes: item.timeBudgetMinutes ?? null,
        })
        .returning({ id: schema.mealPlanEntries.id })
      if (!row) throw new ServiceError('conflict', 'No se pudo crear la entrada del plan')
      addedIds.push(row.id)
      dates.add(item.date)
    }
    return { addedIds, removed, dates }
  })
  const views = addedIds.length > 0 ? await queryEntryViews(ctx.db, and(eq(schema.mealPlanEntries.householdId, ctx.householdId), inArray(schema.mealPlanEntries.id, addedIds))) : []
  const byId = new Map(views.map((v) => [v.id, v]))
  const added = addedIds.map((id) => byId.get(id)).filter((v): v is PlanEntryView => v !== undefined)
  if (dates.size > 0) emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: Array.from(dates) } })
  return { added, removed }
}

// Mueve una entrada de fecha/hueco/orden; id de otro hogar → not_found
export async function moveEntry(ctx: Ctx, input: PlanEntryMove): Promise<PlanEntryView> {
  const [existing] = await ctx.db
    .select({ date: schema.mealPlanEntries.date })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.id, input.entryId), eq(schema.mealPlanEntries.householdId, ctx.householdId)))
    .limit(1)
  if (!existing) throw new ServiceError('not_found', 'Entrada del plan no encontrada')
  await ctx.db
    .update(schema.mealPlanEntries)
    .set({ date: input.date, slot: input.slot, sortOrder: input.sortOrder })
    .where(eq(schema.mealPlanEntries.id, input.entryId))
  const view = await requireEntryView(ctx.db, ctx.householdId, input.entryId)
  const dates = existing.date === input.date ? [input.date] : [existing.date, input.date]
  emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates } })
  return view
}

// servings / timeBudgetMinutes se actualizan tal cual; skipped ↔ skipped_at
export async function patchEntry(ctx: Ctx, id: string, patch: PlanEntryPatch): Promise<PlanEntryView> {
  const [existing] = await ctx.db
    .select({ date: schema.mealPlanEntries.date })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.id, id), eq(schema.mealPlanEntries.householdId, ctx.householdId)))
    .limit(1)
  if (!existing) throw new ServiceError('not_found', 'Entrada del plan no encontrada')
  const set: Partial<typeof schema.mealPlanEntries.$inferInsert> = {}
  if (patch.servings !== undefined) set.servings = patch.servings
  if (patch.timeBudgetMinutes !== undefined) set.timeBudgetMinutes = patch.timeBudgetMinutes
  if (patch.skipped !== undefined) set.skippedAt = patch.skipped ? new Date() : null
  if (Object.keys(set).length > 0) {
    await ctx.db.update(schema.mealPlanEntries).set(set).where(eq(schema.mealPlanEntries.id, id))
  }
  const view = await requireEntryView(ctx.db, ctx.householdId, id)
  emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: [existing.date] } })
  return view
}

// Copia receta/título de la entrada de origen y crea una entrada de sobra ligada a ella
export async function createLeftover(ctx: Ctx, input: { ofEntryId: string; date: string; slot: MealSlot; servings: number }): Promise<PlanEntryView> {
  const [source] = await ctx.db
    .select({ recipeId: schema.mealPlanEntries.recipeId, customTitle: schema.mealPlanEntries.customTitle })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.id, input.ofEntryId), eq(schema.mealPlanEntries.householdId, ctx.householdId)))
    .limit(1)
  if (!source) throw new ServiceError('not_found', 'Entrada de origen no encontrada')
  const [row] = await ctx.db
    .insert(schema.mealPlanEntries)
    .values({
      householdId: ctx.householdId,
      date: input.date,
      slot: input.slot,
      recipeId: source.recipeId,
      customTitle: source.recipeId ? null : source.customTitle,
      servings: input.servings,
      leftoverOfEntryId: input.ofEntryId,
    })
    .returning({ id: schema.mealPlanEntries.id })
  if (!row) throw new ServiceError('conflict', 'No se pudo crear la sobra')
  const view = await requireEntryView(ctx.db, ctx.householdId, row.id)
  emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: [input.date] } })
  return view
}

// Suma de kcal/macros por ración × raciones de las entradas planned+cooked (excluye saltadas y sobras)
export async function rangeNutrition(ctx: Ctx, range: { from: string; to: string }): Promise<{ byDate: Record<string, Nutrition>; total: Nutrition }> {
  const rows = await ctx.db
    .select({
      date: schema.mealPlanEntries.date,
      servings: schema.mealPlanEntries.servings,
      kcalPerServing: schema.recipes.kcalPerServing,
      proteinPerServing: schema.recipes.proteinPerServing,
      carbsPerServing: schema.recipes.carbsPerServing,
      fatPerServing: schema.recipes.fatPerServing,
      fiberPerServing: schema.recipes.fiberPerServing,
      nutritionIsEstimated: schema.recipes.nutritionIsEstimated,
    })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.mealPlanEntries.recipeId))
    .where(
      and(
        eq(schema.mealPlanEntries.householdId, ctx.householdId),
        gte(schema.mealPlanEntries.date, range.from),
        lte(schema.mealPlanEntries.date, range.to),
        isNull(schema.mealPlanEntries.skippedAt),
        isNull(schema.mealPlanEntries.leftoverOfEntryId),
      ),
    )
  const byDateEntries = new Map<string, { nutrition: Nutrition; servings: number }[]>()
  for (const r of rows) {
    const nutrition: Nutrition = {
      perServing: {
        kcal: r.kcalPerServing ?? 0,
        protein: r.proteinPerServing ?? 0,
        carbs: r.carbsPerServing ?? 0,
        fat: r.fatPerServing ?? 0,
        fiber: r.fiberPerServing ?? 0,
      },
      total: EMPTY_MACROS,
      per100g: null,
      isEstimated: r.nutritionIsEstimated,
    }
    const list = byDateEntries.get(r.date) ?? []
    list.push({ nutrition, servings: r.servings })
    byDateEntries.set(r.date, list)
  }
  const byDate: Record<string, Nutrition> = {}
  for (const [date, entries] of byDateEntries) byDate[date] = aggregateNutrition(entries)
  const total = aggregateNutrition(Array.from(byDateEntries.values()).flat())
  return { byDate, total }
}
