// Autorrelleno del plan sin IA (spec §5 bloque "plan-rules.ts", §9.9).
// PURO: solo depende de ./slots. El reloj vive en el servicio, que reduce el
// historial a "hace cuántos días" antes de llamar aquí; así estas funciones
// dan siempre el mismo resultado con la misma entrada.
import type { MealSlot } from './slots'

export type PlanRuleConstraint = 'no-meat' | 'max-minutes' | 'tag' | 'not-tag'

// Una regla del hogar (households.plan_rules). day: 0 domingo … 6 sábado,
// null = todos los días; slot null = todos los huecos.
export interface PlanRule {
  day: number | null
  slot: MealSlot | null
  constraint: PlanRuleConstraint
  value: string
}

// Lo mínimo para decidir qué receta va en un hueco. Se llama RecipeSummary
// porque así la nombra §5; no es la RecipeSummary de lib/services/recipes.ts
// (las fronteras impiden que el dominio la importe: son tipos distintos a
// propósito, y el servicio mapea de una a otra).
export interface RecipeSummary {
  id: string
  title: string
  totalMinutes: number | null
  tagSlugs: string[]
  timesCooked: number
}

export interface CookedHistoryEntry {
  recipeId: string
  daysAgo: number
}
export type CookedHistory = CookedHistoryEntry[]

export interface ProposalAdd {
  date: string // YYYY-MM-DD
  slot: MealSlot
  recipeId: string
  servings: number
}

// Misma forma que lib/validation/plan.ts::ProposalPayload, declarada aquí
// porque el dominio no puede importar de lib/validation (fronteras).
// tests/contracts/plan-rules.test.ts garantiza que no se separen.
export interface ProposalPayload {
  add: ProposalAdd[]
  remove: string[]
}

export interface PlanRulesOptions {
  defaultServings?: number // por defecto 2
  slots?: MealSlot[] // huecos a rellenar; por defecto ['lunch', 'dinner']
  days?: number // días desde weekStart; por defecto 7
  avoidRepeatDays?: number // por defecto 14
}

// Descarta las recetas cocinadas hace menos de `days` días. El borde es
// estricto (`< days`): "no repitas en dos semanas" deja libre el día 14.
export function avoidRecentRepeats(candidates: RecipeSummary[], history: CookedHistory, days: number): RecipeSummary[] {
  const recent = new Set(history.filter((h) => h.daysAgo < days).map((h) => h.recipeId))
  return candidates.filter((r) => !recent.has(r.id))
}

// "Sin carne" se decide por etiqueta, no adivinando de los ingredientes: una
// heurística sobre nombres de alimentos fallaría en dos idiomas y no sería
// explicable al usuario. Los dos slugs vienen del seed (db/seed/tags.json).
export const VEGETARIAN_TAG_SLUGS = ['vegetariano', 'vegano'] as const

export function ruleAllows(rule: PlanRule, recipe: RecipeSummary): boolean {
  if (rule.constraint === 'no-meat') return VEGETARIAN_TAG_SLUGS.some((slug) => recipe.tagSlugs.includes(slug))
  if (rule.constraint === 'tag') return recipe.tagSlugs.includes(rule.value)
  if (rule.constraint === 'not-tag') return !recipe.tagSlugs.includes(rule.value)
  // max-minutes: una receta sin ningún tiempo conocido NO entra (mismo criterio
  // que el filtro maxMinutes de searchRecipes: no se puede asumir que sea rápida).
  const max = Number(rule.value)
  if (!Number.isFinite(max)) return true
  return recipe.totalMinutes !== null && recipe.totalMinutes <= max
}

// Por defecto se rellenan comida y cena: el desayuno y el picoteo casi nunca
// salen del recetario, y proponerlos llenaría la semana de ruido.
const DEFAULT_SLOTS: MealSlot[] = ['lunch', 'dinner']

// Aritmética de fechas en UTC, duplicada a propósito: lib/plan-dates.ts es del
// elemento `lib` y el dominio no puede importarlo (fronteras). Son seis líneas.
function isoOf(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Recorre los huecos de la semana en orden y elige, para cada uno, la primera
// candidata que cumple TODAS las reglas aplicables a ese día y ese hueco.
// Si no hay ninguna, el hueco se queda vacío: mejor un plan con agujeros que
// un plan que se salta el "lunes sin carne".
export function applyPlanRules(
  rules: PlanRule[],
  candidates: RecipeSummary[],
  history: CookedHistory,
  weekStart: Date,
  options: PlanRulesOptions = {},
): ProposalPayload {
  const defaultServings = options.defaultServings ?? 2
  const slots = options.slots ?? DEFAULT_SLOTS
  const days = options.days ?? 7
  const avoidRepeatDays = options.avoidRepeatDays ?? 14

  const fresh = avoidRecentRepeats(candidates, history, avoidRepeatDays)
  // Si la ventana antirrepetición deja el pozo vacío (hogar con pocas recetas),
  // se repite antes que devolver una propuesta vacía.
  const pool = fresh.length > 0 ? fresh : candidates

  const used = new Set<string>()
  const add: ProposalAdd[] = []
  for (let i = 0; i < days; i += 1) {
    const date = new Date(weekStart.getTime())
    date.setUTCDate(date.getUTCDate() + i)
    const dow = date.getUTCDay()
    for (const slot of slots) {
      const applicable = rules.filter((r) => (r.day === null || r.day === dow) && (r.slot === null || r.slot === slot))
      const eligible = pool
        .filter((r) => !used.has(r.id) && applicable.every((rule) => ruleAllows(rule, r)))
        .sort((a, b) => a.timesCooked - b.timesCooked || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
      const pick = eligible[0]
      if (!pick) continue
      used.add(pick.id)
      add.push({ date: isoOf(date), slot, recipeId: pick.id, servings: defaultServings })
    }
  }
  return { add, remove: [] }
}
