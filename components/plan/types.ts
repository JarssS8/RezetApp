import type { MealSlot, PlanEntryInput } from '@/lib/validation/plan'

// Duplicado deliberado de lib/services/plan.ts::PlanEntryView: las fronteras de
// eslint-boundaries prohíben que components importe de lib/services (solo la
// page, que es un server component, llama al servicio directamente y le pasa
// estos datos ya listos a los componentes de cliente).
export interface PlanEntryClient {
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

// A diferencia de PlanEntryClient, aquí sí se reutiliza el tipo de validación
// (lib/validation/plan.ts::PlanEntryInput): las fronteras de eslint-boundaries
// permiten a `components` importar de `validation` (no así de `services`), y
// es exactamente la forma de lib/services/plan.ts::ProposalView['diff']['add'].
export type ProposalAddClient = PlanEntryInput & { title: string; allergenConflicts: string[] }

// Duplicado deliberado de lib/services/plan.ts::ProposalView (sin el `payload`
// crudo, que la tarjeta no necesita).
export interface ProposalClient {
  id: string
  source: 'ai' | 'rules' | 'mcp'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  diff: { add: ProposalAddClient[]; remove: PlanEntryClient[] }
}
