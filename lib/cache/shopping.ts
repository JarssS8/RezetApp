import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { generateShopping } from '@/lib/services/shopping'
import { cacheCtx } from './ctx'
import { householdTag } from './tags'

// Cuatro etiquetas porque consolida cuatro cosas: lo planificado (plan), lo
// que ya hay (pantry), los ingredientes de cada receta (recipes) y las
// conversiones de cada alimento (foods). Sobre-etiquetar cuesta una consulta
// de más; sub-etiquetar cuesta comprar dos veces la misma cebolla.
export async function getShoppingLines(householdId: string, locale: Locale, from: string, to: string): Promise<Awaited<ReturnType<typeof generateShopping>>> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'plan'), householdTag(householdId, 'pantry'), householdTag(householdId, 'recipes'), householdTag(householdId, 'foods'))
  return generateShopping(cacheCtx(householdId, locale), { from, to })
}
