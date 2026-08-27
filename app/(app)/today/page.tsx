import { TodayView } from '@/components/today/today-view'
import { requireHousehold } from '@/lib/auth/guards'
import { getAiSettings } from '@/lib/services/ai-settings'
import { getHouseholdOverview } from '@/lib/services/households'
import { expiringPantry } from '@/lib/services/pantry'
import { dayProgress, listEntries } from '@/lib/services/plan'
import { todayIso } from '@/lib/plan-dates'

export default async function TodayPage() {
  const ctx = await requireHousehold()
  const date = todayIso()
  const household = await getHouseholdOverview(ctx)
  // expiry_alert_days (3 por defecto) es la alerta de Hoy; el ámbar de la fila
  // de despensa usa un umbral fijo de 7 días. Son dos cosas distintas a
  // propósito (spec §7): la fila avisa antes, Hoy solo lo urgente.
  const [entries, progress, expiring, ai] = await Promise.all([
    listEntries(ctx, { from: date, to: date }),
    dayProgress(ctx, date),
    expiringPantry(ctx, household.expiryAlertDays),
    getAiSettings(ctx),
  ])
  return (
    <TodayView
      date={date}
      entries={entries}
      progress={progress}
      expiring={expiring.map((i) => ({ id: i.id, name: i.name, daysToExpiry: i.daysToExpiry }))}
      aiEnabled={ai.provider !== 'none'}
    />
  )
}
