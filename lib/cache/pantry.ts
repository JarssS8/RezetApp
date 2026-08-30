import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { expiringPantry, type PantryRow } from '@/lib/services/pantry'
import { cacheCtx } from './ctx'
import { householdTag } from './tags'

// El instante que representa un día UTC. daysUntil() normaliza con
// Date.UTC(y,m,d) y expiringSoon() compara contra un límite que también cae en
// medianoche (expires_at es una columna `date`), así que este valor da
// exactamente los mismos números que el `new Date()` de hoy -con la diferencia
// de que es determinista, que es lo que "use cache" exige. Ruling W10-R2.
export function dayStart(today: string): Date {
  return new Date(`${today}T00:00:00.000Z`)
}

// 'foods' además de 'pantry': cada fila lleva el alimento entero (nombre en el
// idioma pedido y nutrición), así que corregir un alimento cambia la lista.
export async function getExpiringPantry(householdId: string, locale: Locale, today: string, days: number): Promise<PantryRow[]> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'pantry'), householdTag(householdId, 'foods'))
  return expiringPantry(cacheCtx(householdId, locale), days, dayStart(today))
}
