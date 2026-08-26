import type { MealSlot } from '@/lib/validation/plan'

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

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
