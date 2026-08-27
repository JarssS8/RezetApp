// Autorrelleno del plan por reglas del hogar (spec §9.9). Es el camino SIN IA:
// no importa nada de lib/ai. El dominio decide qué receta va en cada hueco;
// este servicio solo trae los datos y guarda la propuesta.
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import {
  applyPlanRules,
  type CookedHistory,
  type PlanRule,
  type RecipeSummary,
} from '@/lib/domain/plan-rules'
import { PlanRulesSchema } from '@/lib/validation/plan-rules'
import { conflictingRecipeIds } from './allergens'
import { type Ctx, ServiceError } from './ctx'
import { createProposal, type ProposalView } from './plan'

// Tope de candidatas: la semana necesita 14 y ordenar 200 recetas en memoria es
// gratis, pero traer las 3.000 de un hogar grande con sus etiquetas no lo es.
const CANDIDATE_LIMIT = 200
// Ventana del historial que se reduce a daysAgo (el dominio descarta con 14).
const HISTORY_DAYS = 60
const MS_PER_DAY = 86_400_000

export async function getPlanRules(ctx: Ctx): Promise<PlanRule[]> {
  const [row] = await ctx.db
    .select({ planRules: schema.households.planRules })
    .from(schema.households)
    .where(eq(schema.households.id, ctx.householdId))
    .limit(1)
  if (!row) throw new ServiceError('not_found', 'Hogar no encontrado')
  // El jsonb puede contener cualquier cosa (migración manual, versión
  // anterior): si no valida, el hogar se comporta como si no tuviera reglas
  // en vez de romper la pantalla de ajustes.
  const parsed = PlanRulesSchema.safeParse(row.planRules)
  return parsed.success ? parsed.data : []
}

export async function updatePlanRules(ctx: Ctx, rules: PlanRule[]): Promise<PlanRule[]> {
  // Solo el propietario cambia cómo se rellena el plan del hogar (mismo
  // criterio que el resto de ajustes del hogar, ver updateHousehold).
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario puede editar las reglas del plan')
  const parsed = PlanRulesSchema.parse(rules)
  await ctx.db.update(schema.households).set({ planRules: parsed }).where(eq(schema.households.id, ctx.householdId))
  return parsed
}

// Candidatas del hogar con lo que el dominio necesita para decidir, más el
// historial reciente reducido a "hace cuántos días" (así el dominio no
// necesita reloj).
export async function planCandidates(ctx: Ctx, limit = CANDIDATE_LIMIT, now: Date = new Date()): Promise<{ candidates: RecipeSummary[]; history: CookedHistory }> {
  const rows = await ctx.db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      prepMinutes: schema.recipes.prepMinutes,
      cookMinutes: schema.recipes.cookMinutes,
      timesCooked: schema.recipes.timesCooked,
    })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
    .orderBy(schema.recipes.timesCooked, schema.recipes.title)
    .limit(limit)

  const ids = rows.map((r) => r.id)
  const tagRows = ids.length
    ? await ctx.db
        .select({ recipeId: schema.recipeTags.recipeId, slug: schema.tags.slug })
        .from(schema.recipeTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.recipeTags.tagId))
        .where(inArray(schema.recipeTags.recipeId, ids))
    : []
  const slugsByRecipe = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = slugsByRecipe.get(row.recipeId) ?? []
    list.push(row.slug)
    slugsByRecipe.set(row.recipeId, list)
  }

  const candidates: RecipeSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    totalMinutes: r.prepMinutes === null && r.cookMinutes === null ? null : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0),
    tagSlugs: slugsByRecipe.get(r.id) ?? [],
    timesCooked: r.timesCooked,
  }))

  const since = new Date(now.getTime() - HISTORY_DAYS * MS_PER_DAY)
  const logRows = await ctx.db
    .select({ recipeId: schema.cookingLog.recipeId, cookedAt: schema.cookingLog.cookedAt })
    .from(schema.cookingLog)
    .where(eq(schema.cookingLog.householdId, ctx.householdId))
    .orderBy(desc(schema.cookingLog.cookedAt))
    .limit(500)
  const history: CookedHistory = logRows
    .filter((r) => r.cookedAt >= since)
    .map((r) => ({ recipeId: r.recipeId, daysAgo: Math.floor((now.getTime() - r.cookedAt.getTime()) / MS_PER_DAY) }))

  return { candidates, history }
}

// Crea una plan_proposal con source='rules'. Misma UI de aprobación que la IA
// y el MCP: esto NUNCA escribe el plan (spec §9.9, §12).
export async function proposeWeekFromRules(ctx: Ctx, input: { from: string; to: string }, now: Date = new Date()): Promise<ProposalView> {
  const [household] = await ctx.db
    .select({ defaultServings: schema.households.defaultServings })
    .from(schema.households)
    .where(eq(schema.households.id, ctx.householdId))
    .limit(1)
  if (!household) throw new ServiceError('not_found', 'Hogar no encontrado')

  const rules = await getPlanRules(ctx)
  const { candidates, history } = await planCandidates(ctx, CANDIDATE_LIMIT, now)
  if (candidates.length === 0) throw new ServiceError('validation', 'El hogar no tiene recetas para rellenar el plan')

  // Filtro determinista de alérgenos (spec §17 W4(e)): una receta que choca con
  // un alérgeno de cualquier miembro no se ofrece. No se descarta por `unknown`
  // (ingredientes sin alimento resuelto): eso dejaría fuera medio recetario.
  const conflicting = await conflictingRecipeIds(ctx, candidates.map((c) => c.id))
  const safe = candidates.filter((c) => !conflicting.has(c.id))
  if (safe.length === 0) throw new ServiceError('validation', 'Todas las recetas del hogar chocan con algún alérgeno de sus miembros')

  const days = Math.floor((Date.parse(input.to) - Date.parse(input.from)) / MS_PER_DAY) + 1
  const payload = applyPlanRules(rules, safe, history, new Date(`${input.from}T00:00:00Z`), {
    defaultServings: household.defaultServings,
    days: Math.max(1, days),
  })
  if (payload.add.length === 0) throw new ServiceError('validation', 'Ninguna receta cumple las reglas del hogar')

  return createProposal(ctx, { source: 'rules', payload })
}
