import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { expiringPantry, listPantry, type PantryRow } from '@/lib/services/pantry'
import type { PantryQuery } from '@/lib/validation/pantry'
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

// 'foods' además de 'pantry', igual que arriba: cada fila lleva el alimento
// entero. `today` viaja como string por lo mismo que en getExpiringPantry: el
// día entra en la clave para que "caduca en 3 días" ruede cada medianoche en
// vez de congelarse con la primera lectura cacheada.
export async function getPantryList(householdId: string, locale: Locale, today: string, query: PantryQuery): Promise<PantryRow[]> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'pantry'), householdTag(householdId, 'foods'))
  return listPantry(cacheCtx(householdId, locale), query, dayStart(today))
}
