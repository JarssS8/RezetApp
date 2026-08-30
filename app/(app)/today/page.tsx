import { TodayView } from '@/components/today/today-view'
import { requireHousehold } from '@/lib/auth/guards'
import { utcDayIso } from '@/lib/cache/ctx'
import { getAiEnabled, getHouseholdOverviewCached } from '@/lib/cache/household'
import { getExpiringPantry } from '@/lib/cache/pantry'
import { getDayProgress, getPlanEntries } from '@/lib/cache/plan'
import { todayIso } from '@/lib/plan-dates'

export default async function TodayPage() {
  // La sesión se lee aquí, en tiempo de petición, y de ella salen los dos
  // únicos valores que cruzan a la caché: el hogar y el idioma (patrón
  // "extraer el valor y pasarlo a una función cacheada compartida").
  const ctx = await requireHousehold()
  const date = todayIso()
  // El día de caducidades es el día UTC, que es con el que calcula
  // lib/services/pantry.ts; el del plan es el de la zona del hogar. Son dos
  // "hoy" distintos y ya lo eran antes de W10.
  const today = utcDayIso()
  const household = await getHouseholdOverviewCached(ctx.householdId, ctx.locale)
  // expiry_alert_days (3 por defecto) es la alerta de Hoy; el ámbar de la fila
  // de despensa usa un umbral fijo de 7 días. Son dos cosas distintas a
  // propósito (spec §7): la fila avisa antes, Hoy solo lo urgente.
  const [entries, progress, expiring, aiEnabled] = await Promise.all([
    getPlanEntries(ctx.householdId, ctx.locale, date, date),
    getDayProgress(ctx.householdId, ctx.locale, date),
    getExpiringPantry(ctx.householdId, ctx.locale, today, household.expiryAlertDays),
    getAiEnabled(ctx.householdId, ctx.locale),
  ])
  return (
    <TodayView
      date={date}
      entries={entries}
      progress={progress}
      expiring={expiring.map((i) => ({ id: i.id, name: i.name, daysToExpiry: i.daysToExpiry }))}
      aiEnabled={aiEnabled}
    />
  )
}
