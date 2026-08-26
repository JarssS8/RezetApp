// Orquesta las tareas de IA (spec §10, §12): config del hogar → withBudget →
// tarea de lib/ai/tasks/* → efectos en la base de datos. Regla 3 de
// AGENTS.md: sin proveedor configurado, cada función devuelve
// `{ ok: false, code: 'no_provider' }` limpiamente, nunca lanza.
//
// `deps.model` permite inyectar un LanguageModel de prueba (p. ej.
// `MockLanguageModelV3`) sin tocar `lib/ai/provider.ts`: se usa en vez del
// modelo que construiría `withBudget` a partir de la configuración del hogar.
import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import * as schema from '@/db/schema'
import { AiBudgetError, withBudget } from '@/lib/ai/budget'
import type { AiConfig } from '@/lib/ai/provider'
import { resolveAiConfig } from '@/lib/ai/provider'
import { AiStructuredError } from '@/lib/ai/structured'
import { estimateNutrition, type NutritionEstimateSchema } from '@/lib/ai/tasks/estimate-nutrition'
import { AiUnsupportedError, importRecipeFromImageAi, importRecipeFromTextAi } from '@/lib/ai/tasks/import-recipe'
import { parseIngredientsFallback } from '@/lib/ai/tasks/parse-ingredients'
import { proposePlan, type ProposePlanContext, type ProposePlanPlannedEntry, type ProposePlanRecipe, type ProposePlanSlot } from '@/lib/ai/tasks/propose-plan'
import type { BaseUnit, FoodNutrition, ParsedIngredient } from '@/lib/domain/types'
import { normalizeSearchName } from '@/lib/domain/quantities'
import { emitHouseholdEvent } from '@/lib/events/bus'
import { ProposalPayloadSchema } from '@/lib/validation/plan'
import type { RecipeInput } from '@/lib/validation/recipes'
import type { z } from 'zod'
import { type Ctx, type Db, ServiceError } from './ctx'

export type AiFailureCode = 'no_provider' | 'ai_budget' | 'ai_unsupported' | 'ai_output' | 'internal'
export type AiResult<T> = { ok: true; data: T } | { ok: false; code: AiFailureCode; message: string }

export interface AiTaskDeps {
  model?: LanguageModel
}

export type AiImportRecipeInput =
  | { kind: 'text'; text: string }
  // Desviación documentada respecto a la interfaz de la brief original
  // (`{ kind: 'image'; uploadUrl: string }`): `lib/uploads` (pista (a)) no
  // está mergeado en este worktree, así que se acepta el contenido ya leído.
  // (a) adapta `aiImportRecipeAction` al mergear: lee `UPLOADS_DIR`/`uploadUrl`
  // y pasa los bytes aquí.
  | { kind: 'image'; bytes: Uint8Array; mime: string }

// TODO-merge: sustituir por `FoodWithNutrition` de `lib/services/foods.ts`
// (pista (b)) al mergear; forma idéntica a la que define el contrato de esa
// pista en el plan (`FoodSummary & FoodNutrition`).
export interface FoodSummary {
  id: string
  householdId: string | null
  name: string
  nameEs: string
  nameEn: string
  defaultUnit: BaseUnit
  kcal100g: number | null
  isEstimated: boolean
  source: 'off' | 'usda' | 'manual' | 'ai'
  allergens: string[]
}
export type FoodWithNutrition = FoodSummary & FoodNutrition

type Household = typeof schema.households.$inferSelect
type FoodRow = typeof schema.foods.$inferSelect
type NutritionEstimate = z.infer<typeof NutritionEstimateSchema>

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0 }

export class AiOutputError extends Error {
  readonly code = 'ai_output'
  constructor(message = 'El modelo no devolvió una salida utilizable') {
    super(message)
    this.name = 'AiOutputError'
  }
}

function aiOk<T>(data: T): AiResult<T> {
  return { ok: true, data }
}
function aiFail<T = never>(code: AiFailureCode, message: string): AiResult<T> {
  return { ok: false, code, message }
}

async function getHousehold(db: Db, householdId: string): Promise<Household> {
  const [h] = await db.select().from(schema.households).where(eq(schema.households.id, householdId)).limit(1)
  if (!h) throw new ServiceError('not_found', 'Hogar no encontrado')
  return h
}

// Punto único de orquestación: resuelve la configuración de IA del hogar,
// aplica el tope de gasto (`withBudget`) y traduce cualquier error conocido
// al `code` de `AiResult`. `run` recibe el modelo ya resuelto (inyectado por
// `deps.model` o construido a partir de la configuración) y devuelve el
// resultado junto al uso de tokens, tal y como exige `withBudget`.
async function runAiTask<T>(
  ctx: Ctx,
  deps: AiTaskDeps,
  operation: string,
  run: (cfg: AiConfig, model: LanguageModel, household: Household) => Promise<{ result: T; usage: { inputTokens: number; outputTokens: number } }>,
): Promise<AiResult<T>> {
  const household = await getHousehold(ctx.db, ctx.householdId)
  const cfg = resolveAiConfig(household)
  if (!cfg) return aiFail('no_provider', 'El hogar no tiene un proveedor de IA configurado')
  try {
    const data = await withBudget(ctx.db, ctx.householdId, cfg, operation, (model) => run(cfg, deps.model ?? model, household))
    return aiOk(data)
  } catch (err) {
    if (err instanceof AiBudgetError) return aiFail('ai_budget', err.message)
    if (err instanceof AiUnsupportedError) return aiFail('ai_unsupported', err.message)
    if (err instanceof AiOutputError) return aiFail('ai_output', err.message)
    if (err instanceof AiStructuredError) return aiFail('ai_output', err.message)
    console.error('[ai-tasks]', operation, err)
    return aiFail('internal', err instanceof Error ? err.message : 'Error interno')
  }
}

export async function aiParseIngredients(ctx: Ctx, lines: string[], deps: AiTaskDeps = {}): Promise<AiResult<ParsedIngredient[]>> {
  return runAiTask(ctx, deps, 'parse_ingredients', async (cfg, model) => ({
    result: await parseIngredientsFallback(cfg, model, lines, ctx.locale),
    usage: ZERO_USAGE,
  }))
}

export async function aiImportRecipe(ctx: Ctx, input: AiImportRecipeInput, deps: AiTaskDeps = {}): Promise<AiResult<RecipeInput>> {
  return runAiTask(ctx, deps, 'import_recipe', async (cfg, model) => ({
    result:
      input.kind === 'text'
        ? await importRecipeFromTextAi(cfg, model, input.text, ctx.locale)
        : await importRecipeFromImageAi(cfg, model, { bytes: input.bytes, mime: input.mime }, ctx.locale),
    usage: ZERO_USAGE,
  }))
}

function toFoodWithNutrition(row: FoodRow): FoodWithNutrition {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.nameEs,
    nameEs: row.nameEs,
    nameEn: row.nameEn,
    defaultUnit: row.defaultUnit,
    kcal100g: row.kcal100g,
    protein100g: row.protein100g,
    carbs100g: row.carbs100g,
    fat100g: row.fat100g,
    fiber100g: row.fiber100g,
    gramsPerCup: row.gramsPerCup,
    gramsPerTbsp: row.gramsPerTbsp,
    gramsPerUnit: row.gramsPerUnit,
    densityGPerMl: row.densityGPerMl,
    isEstimated: row.isEstimated,
    source: row.source,
    allergens: row.allergens,
  }
}

// TODO-merge: sustituir por `createFood(ctx, …, 'ai')` (pista (b)) al mergear.
async function insertAiFood(db: Db, householdId: string, foodName: string, estimate: NutritionEstimate): Promise<FoodWithNutrition> {
  const trimmed = foodName.trim()
  const searchName = normalizeSearchName(trimmed)
  const [row] = await db
    .insert(schema.foods)
    .values({
      householdId,
      nameEs: trimmed,
      nameEn: trimmed,
      searchNameEs: searchName,
      searchNameEn: searchName,
      aliases: [],
      defaultUnit: estimate.defaultUnit,
      kcal100g: estimate.kcal100g,
      protein100g: estimate.protein100g,
      carbs100g: estimate.carbs100g,
      fat100g: estimate.fat100g,
      fiber100g: estimate.fiber100g,
      gramsPerUnit: estimate.gramsPerUnit,
      source: 'ai',
      isEstimated: true,
    })
    .returning()
  if (!row) throw new Error('No se pudo crear el alimento estimado por IA')
  return toFoodWithNutrition(row)
}

export async function aiEstimateFood(ctx: Ctx, foodName: string, deps: AiTaskDeps = {}): Promise<AiResult<FoodWithNutrition>> {
  return runAiTask(ctx, deps, 'estimate_nutrition', async (cfg, model) => {
    const estimate = await estimateNutrition(cfg, model, foodName, ctx.locale)
    const food = await insertAiFood(ctx.db, ctx.householdId, foodName, estimate)
    return { result: food, usage: ZERO_USAGE }
  })
}

function dateOnly(d: Date): string {
  const iso = d.toISOString()
  return iso.slice(0, 10)
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = []
  let cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cur.getTime() <= end.getTime()) {
    dates.push(dateOnly(cur))
    cur = new Date(cur.getTime() + 86_400_000)
  }
  return dates
}

// Contexto de "Planificar la semana" (spec §5, §10): recetas del hogar,
// despensa que caduca dentro de `expiry_alert_days`, alérgenos/preferencias
// de los miembros y lo que ya hay planificado en el rango (para no
// duplicarlo). No incluye nada que el modelo tenga que calcular.
async function buildProposePlanContext(ctx: Ctx, household: Household, input: { from: string; to: string; notes?: string }): Promise<ProposePlanContext> {
  const recipeRows = await ctx.db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      prepMinutes: schema.recipes.prepMinutes,
      cookMinutes: schema.recipes.cookMinutes,
      timesCooked: schema.recipes.timesCooked,
      lastCookedAt: schema.recipes.lastCookedAt,
    })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))

  const recipeIds = recipeRows.map((r) => r.id)
  const tagRows = recipeIds.length
    ? await ctx.db
        .select({ recipeId: schema.recipeTags.recipeId, name: schema.tags.name })
        .from(schema.recipeTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.recipeTags.tagId))
        .where(inArray(schema.recipeTags.recipeId, recipeIds))
    : []
  const tagsByRecipe = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagsByRecipe.get(row.recipeId) ?? []
    list.push(row.name)
    tagsByRecipe.set(row.recipeId, list)
  }

  const recipes: ProposePlanRecipe[] = recipeRows.map((r) => ({
    id: r.id,
    title: r.title,
    totalMinutes: r.prepMinutes === null && r.cookMinutes === null ? null : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0),
    tags: tagsByRecipe.get(r.id) ?? [],
    timesCooked: r.timesCooked,
    lastCookedAt: r.lastCookedAt ? dateOnly(r.lastCookedAt) : null,
  }))

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() + household.expiryAlertDays)
  const expiringRows = await ctx.db
    .select({ name: schema.foods.nameEs })
    .from(schema.pantryItems)
    .innerJoin(schema.foods, eq(schema.foods.id, schema.pantryItems.foodId))
    .where(and(eq(schema.pantryItems.householdId, ctx.householdId), isNotNull(schema.pantryItems.expiresAt), lte(schema.pantryItems.expiresAt, dateOnly(cutoff))))
  const expiringFoods = Array.from(new Set(expiringRows.map((r) => r.name)))

  const memberRows = await ctx.db
    .select({ allergens: schema.householdMembers.allergens, dietaryFlags: schema.householdMembers.dietaryFlags })
    .from(schema.householdMembers)
    .where(eq(schema.householdMembers.householdId, ctx.householdId))
  const allergens = Array.from(new Set(memberRows.flatMap((m) => m.allergens)))
  const dietaryFlags = Array.from(new Set(memberRows.flatMap((m) => m.dietaryFlags)))

  const entryRows = await ctx.db
    .select({ date: schema.mealPlanEntries.date, slot: schema.mealPlanEntries.slot, customTitle: schema.mealPlanEntries.customTitle, recipeTitle: schema.recipes.title })
    .from(schema.mealPlanEntries)
    .leftJoin(schema.recipes, eq(schema.recipes.id, schema.mealPlanEntries.recipeId))
    .where(and(eq(schema.mealPlanEntries.householdId, ctx.householdId), gte(schema.mealPlanEntries.date, input.from), lte(schema.mealPlanEntries.date, input.to)))
  const alreadyPlanned: ProposePlanPlannedEntry[] = entryRows.map((r) => ({
    date: r.date,
    slot: r.slot,
    title: r.recipeTitle ?? r.customTitle ?? '',
  }))

  return {
    from: input.from,
    to: input.to,
    recipes,
    expiringFoods,
    allergens,
    dietaryFlags,
    alreadyPlanned,
    notes: input.notes ?? null,
  }
}

export async function aiProposeWeek(ctx: Ctx, input: { from: string; to: string; notes?: string }, deps: AiTaskDeps = {}): Promise<AiResult<{ proposalId: string }>> {
  return runAiTask(ctx, deps, 'propose_week', async (cfg, model, household) => {
    const context = await buildProposePlanContext(ctx, household, input)
    if (context.recipes.length === 0) throw new AiOutputError('El hogar no tiene recetas para proponer un plan')

    const { picks, usage } = await proposePlan(cfg, model, context, ctx.locale)

    const recipeIds = new Set(context.recipes.map((r) => r.id))
    const validSlots = new Set<ProposePlanSlot>(['breakfast', 'lunch', 'dinner', 'snack'])
    const validDates = new Set(enumerateDates(input.from, input.to))
    const filtered = picks.filter((p) => recipeIds.has(p.recipeId) && validSlots.has(p.slot) && validDates.has(p.date))
    if (filtered.length === 0) throw new AiOutputError('El modelo no propuso ninguna receta válida')

    // El código decide CUÁNTO (raciones = default_servings del hogar); el
    // modelo solo eligió QUÉ receta va en cada (fecha, hueco).
    const payload = ProposalPayloadSchema.parse({
      add: filtered.map((p) => ({ date: p.date, slot: p.slot, recipeId: p.recipeId, servings: household.defaultServings })),
      remove: [],
    })

    // TODO-merge: sustituir por `createProposal` de la pista (c) al mergear.
    const [row] = await ctx.db
      .insert(schema.planProposals)
      .values({
        householdId: ctx.householdId,
        createdByUserId: ctx.userId,
        createdByTokenId: ctx.apiTokenId,
        source: 'ai',
        status: 'pending',
        payload,
      })
      .returning({ id: schema.planProposals.id })
    if (!row) throw new Error('No se pudo crear la propuesta')

    emitHouseholdEvent(ctx.householdId, { type: 'proposal.created', payload: { proposalId: row.id } })
    return { result: { proposalId: row.id }, usage }
  })
}
