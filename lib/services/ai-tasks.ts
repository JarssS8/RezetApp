// Orquesta las tareas de IA (spec §10, §12): config del hogar → withBudget →
// tarea de lib/ai/tasks/* → efectos en la base de datos. Regla 3 de
// AGENTS.md: sin proveedor configurado, cada función devuelve
// `{ ok: false, code: 'no_provider' }` limpiamente, nunca lanza.
//
// `deps.model` permite inyectar un LanguageModel de prueba (p. ej.
// `MockLanguageModelV3`) sin tocar `lib/ai/provider.ts`: se usa en vez del
// modelo que construiría `withBudget` a partir de la configuración del hogar.
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import * as schema from '@/db/schema'
import { AiBudgetError, withBudget } from '@/lib/ai/budget'
import type { AiConfig } from '@/lib/ai/provider'
import { resolveAiConfig } from '@/lib/ai/provider'
import { AiStructuredError } from '@/lib/ai/structured'
import { estimateNutrition } from '@/lib/ai/tasks/estimate-nutrition'
import { AiUnsupportedError, importRecipeFromImageAi, importRecipeFromTextAi } from '@/lib/ai/tasks/import-recipe'
import { parseIngredientsFallback } from '@/lib/ai/tasks/parse-ingredients'
import { proposePlan, type ProposePlanContext, type ProposePlanPlannedEntry, type ProposePlanRecipe, type ProposePlanSlot } from '@/lib/ai/tasks/propose-plan'
import type { BaseUnit, ParsedIngredient } from '@/lib/domain/types'
import { createFood, type FoodWithNutrition } from '@/lib/services/foods'
import { ProposalPayloadSchema } from '@/lib/validation/plan'
import type { FoodInput } from '@/lib/validation/foods'
import type { RecipeInput } from '@/lib/validation/recipes'
import { type Ctx, type Db, ServiceError } from './ctx'
import { createProposal } from './plan'

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

export type { FoodWithNutrition }

type Household = typeof schema.households.$inferSelect

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
// resultado junto al uso real de tokens de `generateStructured`, tal y como
// exige `withBudget` para calcular `cost_cents` y registrar `ai_usage_log`.
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
  return runAiTask(ctx, deps, 'parse_ingredients', (cfg, model) => parseIngredientsFallback(cfg, model, lines, ctx.locale))
}

export async function aiImportRecipe(ctx: Ctx, input: AiImportRecipeInput, deps: AiTaskDeps = {}): Promise<AiResult<RecipeInput>> {
  return runAiTask(ctx, deps, 'import_recipe', (cfg, model) =>
    input.kind === 'text'
      ? importRecipeFromTextAi(cfg, model, input.text, ctx.locale)
      : importRecipeFromImageAi(cfg, model, { bytes: input.bytes, mime: input.mime }, ctx.locale),
  )
}

// Construye el `FoodInput` de la estimación de IA (§9.4, Task 3): sin alias,
// alérgenos ni conversiones de volumen — eso lo añade una corrección manual
// posterior. `isEstimated` no es un campo de `FoodInput`: lo fija `createFood`
// a partir del `source` que se le pasa ('ai' -> estimado).
function toFoodInput(foodName: string, estimate: { defaultUnit: BaseUnit; kcal100g: number; protein100g: number; carbs100g: number; fat100g: number; fiber100g: number; gramsPerUnit: number | null }): FoodInput {
  const trimmed = foodName.trim()
  return {
    nameEs: trimmed,
    nameEn: trimmed,
    aliases: [],
    defaultUnit: estimate.defaultUnit,
    kcal100g: estimate.kcal100g,
    protein100g: estimate.protein100g,
    carbs100g: estimate.carbs100g,
    fat100g: estimate.fat100g,
    fiber100g: estimate.fiber100g,
    gramsPerUnit: estimate.gramsPerUnit,
    allergens: [],
    seasonalMonths: [],
  }
}

export async function aiEstimateFood(ctx: Ctx, foodName: string, deps: AiTaskDeps = {}): Promise<AiResult<FoodWithNutrition>> {
  return runAiTask(ctx, deps, 'estimate_nutrition', async (cfg, model) => {
    const { result: estimate, usage } = await estimateNutrition(cfg, model, foodName, ctx.locale)
    const food = await createFood(ctx, toFoodInput(foodName, estimate), 'ai')
    return { result: food, usage }
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

// Cota del contexto de recetas que se manda al modelo (spec §10: modelos
// ≤ 8B, prompt corto). Con más recetas que esto, se prioriza variedad:
// primero las nunca cocinadas (`lastCookedAt` null) y, dentro de cada grupo,
// las menos veces cocinadas.
const RECIPE_CONTEXT_LIMIT = 80
const TAGS_PER_RECIPE_LIMIT = 5

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
    .orderBy(sql`${schema.recipes.lastCookedAt} asc nulls first`, asc(schema.recipes.timesCooked))
    .limit(RECIPE_CONTEXT_LIMIT)

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
    tags: (tagsByRecipe.get(r.id) ?? []).slice(0, TAGS_PER_RECIPE_LIMIT),
    timesCooked: r.timesCooked,
    lastCookedAt: r.lastCookedAt ? dateOnly(r.lastCookedAt) : null,
  }))

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() + household.expiryAlertDays)
  // Nombre en el idioma del hogar (no siempre español): el modelo recibe el
  // contexto en ctx.locale (ver proposePlanSystemPrompt), y el nombre de un
  // alimento que caduca debía respetar ese mismo idioma (I8 de la revisión final).
  const expiringRows = await ctx.db
    .select({ name: ctx.locale === 'en' ? schema.foods.nameEn : schema.foods.nameEs })
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

    const proposal = await createProposal(ctx, { source: 'ai', payload })
    return { result: { proposalId: proposal.id }, usage }
  })
}
