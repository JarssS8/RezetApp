import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { dayProgress, listEntries, listProposals, planStats, rangeNutrition, type DayProgress, type PlanEntryView, type PlanStats, type ProposalView } from '@/lib/services/plan'
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

export async function getRangeNutrition(householdId: string, locale: Locale, from: string, to: string): Promise<Awaited<ReturnType<typeof rangeNutrition>>> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'plan'), householdTag(householdId, 'recipes'))
  return rangeNutrition(cacheCtx(householdId, locale), { from, to })
}

// `onlyPending` en vez del `status?: 'pending'` del servicio: un booleano es
// una clave de caché más pequeña y con menos formas posibles que un opcional.
export async function getProposals(householdId: string, locale: Locale, onlyPending: boolean): Promise<ProposalView[]> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'plan'))
  const ctx = cacheCtx(householdId, locale)
  return onlyPending ? listProposals(ctx, 'pending') : listProposals(ctx)
}

export async function getPlanStats(householdId: string, locale: Locale, from: string, to: string): Promise<PlanStats> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'plan'), householdTag(householdId, 'recipes'))
  return planStats(cacheCtx(householdId, locale), { from, to })
}
