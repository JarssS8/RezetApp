import { and, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { emitHouseholdEvent } from '@/lib/events/bus'
import { aggregateNutrition, EMPTY_MACROS, entryStatus } from '@/lib/domain'
import type { FoodConversion, Nutrition, PlannedEntry, ShoppingIngredient } from '@/lib/domain'
import { ProposalPayloadSchema } from '@/lib/validation/plan'
import type { MealSlot, PlanBatch, PlanEntryInput, PlanEntryMove, PlanEntryPatch, ProposalPayload } from '@/lib/validation/plan'
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

// Una entrada por id, o null si no es del hogar. La necesita el modo cocina.
async function findEntryView(db: Db, householdId: string, id: string): Promise<PlanEntryView | null> {
  const [view] = await queryEntryViews(db, and(eq(schema.mealPlanEntries.householdId, householdId), eq(schema.mealPlanEntries.id, id)))
  return view ?? null
}

async function requireEntryView(db: Db, householdId: string, id: string): Promise<PlanEntryView> {
  const view = await findEntryView(db, householdId, id)
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

export async function getEntry(ctx: Ctx, id: string): Promise<PlanEntryView | null> {
  return findEntryView(ctx.db, ctx.householdId, id)
}

// Núcleo transaccional de un lote: lo comparten applyBatch y decideProposal (aprobación de propuesta)
async function applyBatchTx(tx: Db, householdId: string, batch: PlanBatch): Promise<{ addedIds: string[]; removed: string[]; dates: Set<string> }> {
  const dates = new Set<string>()
  let removed: string[] = []
  if (batch.remove.length > 0) {
    const rows = await tx
      .delete(schema.mealPlanEntries)
      .where(and(eq(schema.mealPlanEntries.householdId, householdId), inArray(schema.mealPlanEntries.id, batch.remove)))
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
        .where(and(eq(schema.recipes.id, item.recipeId), eq(schema.recipes.householdId, householdId), isNull(schema.recipes.deletedAt)))
        .limit(1)
      if (!recipe) throw new ServiceError('validation', 'La receta no pertenece al hogar')
    }
    const [row] = await tx
      .insert(schema.mealPlanEntries)
      .values({
        householdId,
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
}

// Alta y baja de entradas en una sola transacción; los ids de `remove` de otro hogar se ignoran sin error
export async function applyBatch(ctx: Ctx, batch: PlanBatch): Promise<{ added: PlanEntryView[]; removed: string[] }> {
  const { addedIds, removed, dates } = await ctx.db.transaction((tx) => applyBatchTx(tx, ctx.householdId, batch))
  const views = addedIds.length > 0 ? await queryEntryViews(ctx.db, and(eq(schema.mealPlanEntries.householdId, ctx.householdId), inArray(schema.mealPlanEntries.id, addedIds))) : []
  const byId = new Map(views.map((v) => [v.id, v]))
  const added = addedIds.map((id) => byId.get(id)).filter((v): v is PlanEntryView => v !== undefined)
  if (dates.size > 0) emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: Array.from(dates) } })
  return { added, removed }
}

export interface ProposalView {
  id: string
  source: 'ai' | 'rules' | 'mcp'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  payload: ProposalPayload
  diff: { add: (PlanEntryInput & { title: string })[]; remove: PlanEntryView[] }
}

type ProposalRow = typeof schema.planProposals.$inferSelect

// Un único SELECT con inArray para todos los recipeId del lote (evita N consultas repetidas),
// acotado al hogar y sin recetas borradas: los títulos de una propuesta pendiente nunca deben
// filtrar el nombre (ni la existencia) de una receta de otro hogar (hallazgo C1 de la revisión final).
// createProposal reutiliza esta misma consulta para validar que cada recipeId es del hogar.
async function lookupRecipeTitles(ctx: Ctx, recipeIds: string[]): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({ id: schema.recipes.id, title: schema.recipes.title })
    .from(schema.recipes)
    .where(and(inArray(schema.recipes.id, recipeIds), eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
  return new Map(rows.map((r) => [r.id, r.title]))
}

// El add del diff se enriquece con el título vigente de la receta (o el customTitle del propio payload);
// el remove son las PlanEntryView actuales de los ids que aún existan (los que ya no existen se omiten)
async function buildProposalDiff(ctx: Ctx, payload: ProposalPayload): Promise<ProposalView['diff']> {
  const recipeIds = Array.from(new Set(payload.add.map((item) => item.recipeId).filter((id): id is string => id !== null && id !== undefined)))
  const titleById = recipeIds.length > 0 ? await lookupRecipeTitles(ctx, recipeIds) : new Map<string, string>()
  const add = payload.add.map(
    (item): PlanEntryInput & { title: string } => ({ ...item, title: (item.recipeId ? titleById.get(item.recipeId) : undefined) ?? item.customTitle ?? '' }),
  )
  const remove =
    payload.remove.length > 0
      ? await queryEntryViews(ctx.db, and(eq(schema.mealPlanEntries.householdId, ctx.householdId), inArray(schema.mealPlanEntries.id, payload.remove)))
      : []
  return { add, remove }
}

async function toProposalView(ctx: Ctx, row: ProposalRow): Promise<ProposalView> {
  const payload = ProposalPayloadSchema.parse(row.payload)
  const diff = await buildProposalDiff(ctx, payload)
  return { id: row.id, source: row.source, status: row.status, createdAt: row.createdAt.toISOString(), payload, diff }
}

// createdByUserId o createdByTokenId según ctx (exactamente uno no nulo, ver check plan_proposals_one_creator).
// Valida antes de insertar que cada recipeId del lote sea del hogar y no esté borrado: hoy solo
// escribe aiProposeWeek (que ya prefiltra), pero un cliente MCP puede llamar a esto con cualquier
// UUID y los títulos de ProposalView.diff no deben poder filtrar el nombre de una receta ajena.
export async function createProposal(ctx: Ctx, input: { source: 'ai' | 'rules' | 'mcp'; payload: ProposalPayload }): Promise<ProposalView> {
  const recipeIds = Array.from(new Set(input.payload.add.map((item) => item.recipeId).filter((id): id is string => id !== null && id !== undefined)))
  if (recipeIds.length > 0) {
    const owned = await lookupRecipeTitles(ctx, recipeIds)
    if (recipeIds.some((id) => !owned.has(id))) throw new ServiceError('validation', 'La receta no pertenece al hogar')
  }
  const [row] = await ctx.db
    .insert(schema.planProposals)
    .values({ householdId: ctx.householdId, createdByUserId: ctx.userId, createdByTokenId: ctx.apiTokenId, source: input.source, payload: input.payload })
    .returning()
  if (!row) throw new ServiceError('conflict', 'No se pudo crear la propuesta')
  const view = await toProposalView(ctx, row)
  emitHouseholdEvent(ctx.householdId, { type: 'proposal.created', payload: { proposalId: row.id } })
  return view
}

export async function listProposals(ctx: Ctx, status?: 'pending'): Promise<ProposalView[]> {
  const where = status
    ? and(eq(schema.planProposals.householdId, ctx.householdId), eq(schema.planProposals.status, status))
    : eq(schema.planProposals.householdId, ctx.householdId)
  const rows = await ctx.db.select().from(schema.planProposals).where(where).orderBy(schema.planProposals.createdAt)
  return Promise.all(rows.map((row) => toProposalView(ctx, row)))
}

// Transición atómica pending -> approved|rejected: el UPDATE con WHERE status='pending' hace de lock
// optimista (bloquea la fila hasta que la otra transacción concurrente termine y ya no vea 'pending').
// Sin fila devuelta: si la propuesta existe → conflict (ya decidida); si no → not_found
async function resolveProposalTx(tx: Db, householdId: string, id: string, status: 'approved' | 'rejected', userId: string): Promise<ProposalRow> {
  const [updated] = await tx
    .update(schema.planProposals)
    .set({ status, resolvedAt: new Date(), resolvedByUserId: userId })
    .where(and(eq(schema.planProposals.id, id), eq(schema.planProposals.householdId, householdId), eq(schema.planProposals.status, 'pending')))
    .returning()
  if (updated) return updated
  const [existing] = await tx
    .select()
    .from(schema.planProposals)
    .where(and(eq(schema.planProposals.id, id), eq(schema.planProposals.householdId, householdId)))
    .limit(1)
  if (existing) throw new ServiceError('conflict', 'La propuesta ya fue decidida')
  throw new ServiceError('not_found', 'Propuesta no encontrada')
}

// approve: el UPDATE (lock) va primero y luego se aplica el lote (mismo camino que applyBatch) en la
// misma transacción, así un fallo en el lote revierte también el cambio de status.
// reject: solo el UPDATE. Propuesta ya decidida → conflict; de otro hogar → not_found; token → forbidden
export async function decideProposal(ctx: Ctx, id: string, decision: 'approve' | 'reject'): Promise<ProposalView> {
  if (ctx.userId === null) throw new ServiceError('forbidden', 'Solo un usuario con sesión puede decidir propuestas')
  const userId = ctx.userId

  if (decision === 'reject') {
    const updated = await ctx.db.transaction((tx) => resolveProposalTx(tx, ctx.householdId, id, 'rejected', userId))
    return toProposalView(ctx, updated)
  }

  const result = await ctx.db.transaction(async (tx) => {
    const updated = await resolveProposalTx(tx, ctx.householdId, id, 'approved', userId)
    const batch = ProposalPayloadSchema.parse(updated.payload)
    const applied = await applyBatchTx(tx, ctx.householdId, batch)
    return { updated, applied }
  })
  if (result.applied.dates.size > 0) emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: Array.from(result.applied.dates) } })
  return toProposalView(ctx, result.updated)
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
    .where(and(eq(schema.mealPlanEntries.id, input.entryId), eq(schema.mealPlanEntries.householdId, ctx.householdId)))
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
    await ctx.db.update(schema.mealPlanEntries).set(set).where(and(eq(schema.mealPlanEntries.id, id), eq(schema.mealPlanEntries.householdId, ctx.householdId)))
  }
  const view = await requireEntryView(ctx.db, ctx.householdId, id)
  emitHouseholdEvent(ctx.householdId, { type: 'plan.changed', payload: { dates: [existing.date] } })
  return view
}

// Copia receta/título de la entrada de origen y crea una entrada de sobra ligada a ella
export async function createLeftover(ctx: Ctx, input: { ofEntryId: string; date: string; slot: MealSlot; servings: number }): Promise<PlanEntryView> {
  const [source] = await ctx.db
    .select({ recipeId: schema.mealPlanEntries.recipeId, customTitle: schema.mealPlanEntries.customTitle, leftoverOfEntryId: schema.mealPlanEntries.leftoverOfEntryId })
    .from(schema.mealPlanEntries)
    .where(and(eq(schema.mealPlanEntries.id, input.ofEntryId), eq(schema.mealPlanEntries.householdId, ctx.householdId)))
    .limit(1)
  if (!source) throw new ServiceError('not_found', 'Entrada de origen no encontrada')
  // Una sobra no puede tener sobra: la despensa ya se descontó el día que se
  // cocinó el original (misma regla que impide cocinar una sobra, cooking.ts).
  if (source.leftoverOfEntryId !== null) throw new ServiceError('validation', 'Una sobra no puede tener su propia sobra')
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
    .innerJoin(schema.recipes, and(eq(schema.recipes.id, schema.mealPlanEntries.recipeId), isNull(schema.recipes.deletedAt)))
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

export interface DayProgress {
  date: string
  plannedKcal: number
  cookedKcal: number
  hasEstimates: boolean
  // Distinto de hasEstimates: una receta puede tener kcal estimadas (buena fe,
  // valor aproximado) o directamente NINGÚN dato nutricional. Este flag es
  // para lo segundo: el anillo de Hoy debe avisar de que el total se queda
  // corto, no solo de que es una estimación.
  hasUnknownKcal: boolean
}

// Los dos números del anillo de Hoy (spec §8): kcal del día y cuántas de ellas
// ya están cocinadas. Mismas exclusiones que rangeNutrition -saltadas y sobras
// fuera-: la sobra ya sumó el día que se cocinó su receta, contarla otra vez
// duplicaría las calorías del hogar. La multiplicación por raciones la hace
// aggregateNutrition (dominio), nunca este servicio.
export async function dayProgress(ctx: Ctx, date: string): Promise<DayProgress> {
  const rows = await ctx.db
    .select({
      servings: schema.mealPlanEntries.servings,
      cookedAt: schema.mealPlanEntries.cookedAt,
      kcalPerServing: schema.recipes.kcalPerServing,
      nutritionIsEstimated: schema.recipes.nutritionIsEstimated,
    })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.recipes, and(eq(schema.recipes.id, schema.mealPlanEntries.recipeId), isNull(schema.recipes.deletedAt)))
    .where(
      and(
        eq(schema.mealPlanEntries.householdId, ctx.householdId),
        eq(schema.mealPlanEntries.date, date),
        isNull(schema.mealPlanEntries.skippedAt),
        isNull(schema.mealPlanEntries.leftoverOfEntryId),
      ),
    )
  const toEntry = (r: (typeof rows)[number]) => ({
    nutrition: { perServing: { kcal: r.kcalPerServing ?? 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, total: EMPTY_MACROS, per100g: null, isEstimated: r.nutritionIsEstimated },
    servings: r.servings,
  })
  const planned = aggregateNutrition(rows.map(toEntry))
  const cooked = aggregateNutrition(rows.filter((r) => r.cookedAt !== null).map(toEntry))
  return {
    date,
    plannedKcal: Math.round(planned.total.kcal),
    cookedKcal: Math.round(cooked.total.kcal),
    hasEstimates: rows.some((r) => r.nutritionIsEstimated),
    hasUnknownKcal: rows.some((r) => r.kcalPerServing === null),
  }
}

function foodConversionOf(f: { defaultUnit: string | null; gramsPerCup: number | null; gramsPerTbsp: number | null; gramsPerUnit: number | null; densityGPerMl: number | null }): FoodConversion {
  return {
    defaultUnit: (f.defaultUnit as FoodConversion['defaultUnit'] | null) ?? null,
    gramsPerCup: f.gramsPerCup,
    gramsPerTbsp: f.gramsPerTbsp,
    gramsPerUnit: f.gramsPerUnit,
    densityGPerMl: f.densityGPerMl,
  }
}

// Entradas del rango listas para lib/domain/shopping.ts::consolidateNeeds: solo
// las que aún necesitan compra (planned+cooked no importa aquí, consolidateNeeds
// ya descarta sobras/cocinadas/saltadas; filtramos aquí también para no cargar
// ingredientes de entradas que se van a descartar igualmente)
export async function plannedEntriesForShopping(ctx: Ctx, range: { from: string; to: string }): Promise<PlannedEntry[]> {
  const entryRows = await ctx.db
    .select({
      id: schema.mealPlanEntries.id,
      servings: schema.mealPlanEntries.servings,
      recipeId: schema.recipes.id,
      servingsBase: schema.recipes.servingsBase,
    })
    .from(schema.mealPlanEntries)
    .innerJoin(schema.recipes, and(eq(schema.recipes.id, schema.mealPlanEntries.recipeId), isNull(schema.recipes.deletedAt)))
    .where(
      and(
        eq(schema.mealPlanEntries.householdId, ctx.householdId),
        gte(schema.mealPlanEntries.date, range.from),
        lte(schema.mealPlanEntries.date, range.to),
        isNull(schema.mealPlanEntries.cookedAt),
        isNull(schema.mealPlanEntries.skippedAt),
        isNull(schema.mealPlanEntries.leftoverOfEntryId),
      ),
    )
  if (entryRows.length === 0) return []

  const recipeIds = Array.from(new Set(entryRows.map((r) => r.recipeId)))
  const ingredientRows = await ctx.db
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      id: schema.recipeIngredients.id,
      foodId: schema.recipeIngredients.foodId,
      rawText: schema.recipeIngredients.rawText,
      quantity: schema.recipeIngredients.quantity,
      unit: schema.recipeIngredients.unit,
      displayQuantity: schema.recipeIngredients.displayQuantity,
      displayUnit: schema.recipeIngredients.displayUnit,
      preparation: schema.recipeIngredients.preparation,
      groupLabel: schema.recipeIngredients.groupLabel,
      stepIndex: schema.recipeIngredients.stepIndex,
      scalesLinearly: schema.recipeIngredients.scalesLinearly,
      sortOrder: schema.recipeIngredients.sortOrder,
      foodNameEs: schema.foods.nameEs,
      foodNameEn: schema.foods.nameEn,
      defaultUnit: schema.foods.defaultUnit,
      gramsPerCup: schema.foods.gramsPerCup,
      gramsPerTbsp: schema.foods.gramsPerTbsp,
      gramsPerUnit: schema.foods.gramsPerUnit,
      densityGPerMl: schema.foods.densityGPerMl,
    })
    .from(schema.recipeIngredients)
    .leftJoin(schema.foods, eq(schema.foods.id, schema.recipeIngredients.foodId))
    .where(inArray(schema.recipeIngredients.recipeId, recipeIds))

  const ingredientsByRecipe = new Map<string, ShoppingIngredient[]>()
  for (const r of ingredientRows) {
    const conversion = r.foodId !== null ? foodConversionOf(r) : null
    const foodName = r.foodId !== null ? (ctx.locale === 'en' ? (r.foodNameEn ?? r.rawText) : (r.foodNameEs ?? r.rawText)) : r.rawText
    const ingredient: ShoppingIngredient = {
      id: r.id,
      foodId: r.foodId,
      rawText: r.rawText,
      quantity: r.quantity,
      unit: r.unit,
      displayQuantity: r.displayQuantity,
      displayUnit: r.displayUnit,
      preparation: r.preparation,
      groupLabel: r.groupLabel,
      stepIndex: r.stepIndex,
      scalesLinearly: r.scalesLinearly,
      sortOrder: r.sortOrder,
      foodName,
      conversion,
    }
    const list = ingredientsByRecipe.get(r.recipeId) ?? []
    list.push(ingredient)
    ingredientsByRecipe.set(r.recipeId, list)
  }

  return entryRows.map(
    (r): PlannedEntry => ({
      id: r.id,
      servings: r.servings,
      leftoverOfEntryId: null,
      cookedAt: null,
      skippedAt: null,
      recipe: { servingsBase: r.servingsBase, ingredients: ingredientsByRecipe.get(r.recipeId) ?? [] },
    }),
  )
}
