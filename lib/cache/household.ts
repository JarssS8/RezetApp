import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { getAiSettings } from '@/lib/services/ai-settings'
import { getHouseholdOverview } from '@/lib/services/households'
import { cacheCtx } from './ctx'
import { householdTag } from './tags'

export async function getHouseholdOverviewCached(householdId: string, locale: Locale): Promise<Awaited<ReturnType<typeof getHouseholdOverview>>> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'settings'))
  return getHouseholdOverview(cacheCtx(householdId, locale))
}

// Se cachea el interruptor, no los ajustes. getAiSettings agrega el gasto del
// mes con date_trunc('month', now()) en Postgres: cachear esa cifra la
// congelaría, y /settings/ai -que sí la enseña- no se cachea. Hoy solo
// necesita saber si hay proveedor.
export async function getAiEnabled(householdId: string, locale: Locale): Promise<boolean> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'settings'))
  const settings = await getAiSettings(cacheCtx(householdId, locale))
  return settings.provider !== 'none'
}
