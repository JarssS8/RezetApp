import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { dayProgress, listEntries, type DayProgress, type PlanEntryView } from '@/lib/services/plan'
import { cacheCtx } from './ctx'
import { householdTag } from './tags'

// 'recipes' además de 'plan' en todo lo que devuelve entradas: la vista de una
// entrada incorpora el título y las kcal de la receta, así que renombrar una
// receta cambia el plan aunque el plan no se haya tocado.
export async function getPlanEntries(householdId: string, locale: Locale, from: string, to: string): Promise<PlanEntryView[]> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'plan'), householdTag(householdId, 'recipes'))
  return listEntries(cacheCtx(householdId, locale), { from, to })
}

export async function getDayProgress(householdId: string, locale: Locale, date: string): Promise<DayProgress> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'plan'), householdTag(householdId, 'recipes'))
  return dayProgress(cacheCtx(householdId, locale), date)
}
