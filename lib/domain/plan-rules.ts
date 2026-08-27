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
