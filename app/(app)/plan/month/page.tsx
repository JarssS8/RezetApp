import { getTranslations } from 'next-intl/server'
import { MonthView, type MonthDayCell } from '@/components/plan/month-view'
import { PlanLiveRefresh } from '@/components/plan/plan-live-refresh'
import { ScreenHeader } from '@/components/ui/screen-header'
import { requireHousehold } from '@/lib/auth/guards'
import { getPlanEntries, getRangeNutrition } from '@/lib/cache/plan'
import { MEAL_SLOTS } from '@/lib/domain'
import { addDays, monthRange, todayIso, weekRange } from '@/lib/plan-dates'
import type { MealSlot } from '@/lib/validation/plan'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanMonthPageProps {
  searchParams: Promise<SearchParams>
}

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

// Mes anterior/siguiente al indicado, en formato 'YYYY-MM'.
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y as number, (m as number) - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

// /plan/month?month=YYYY-MM — mes actual por defecto si falta o es inválido
// (regla de controlador; a diferencia de /plan, no hace falta normalizar con
// un redirect porque cualquier 'YYYY-MM' válido ya es canónico).
export default async function PlanMonthPage({ searchParams }: PlanMonthPageProps) {
  const ctx = await requireHousehold()
  const sp = await searchParams
  const t = await getTranslations('plan')

  const today = todayIso()
  const requestedMonth = firstParam(sp.month)
  const month = requestedMonth && MONTH_PARAM.test(requestedMonth) ? requestedMonth : today.slice(0, 7)

  const firstOfMonth = `${month}-01`
  const { to: lastOfMonth } = monthRange(firstOfMonth)
  // La rejilla siempre son 6 semanas completas (lunes a domingo) para cubrir
  // cualquier mes; los días de desbordamiento de meses vecinos se marcan
  // `inMonth: false` y no llevan datos (listEntries/rangeNutrition solo
  // cubren el mes en sí, regla de controlador).
  const gridStart = weekRange(firstOfMonth).from
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  const monthRangeQuery = { from: firstOfMonth, to: lastOfMonth }
  const [entries, nutrition] = await Promise.all([
    getPlanEntries(ctx.householdId, ctx.locale, monthRangeQuery.from, monthRangeQuery.to),
    getRangeNutrition(ctx.householdId, ctx.locale, monthRangeQuery.from, monthRangeQuery.to),
  ])

  const slotsByDate = new Map<string, Set<MealSlot>>()
  for (const e of entries) {
    const set = slotsByDate.get(e.date) ?? new Set<MealSlot>()
    set.add(e.slot)
    slotsByDate.set(e.date, set)
  }

  const weeks: MonthDayCell[][] = []
  for (let row = 0; row < 6; row++) {
    const week: MonthDayCell[] = []
    for (let col = 0; col < 7; col++) {
      const date = days[row * 7 + col] as string
      const occupiedSlots = slotsByDate.get(date)
      const dayNutrition = nutrition.byDate[date]
      week.push({
        date,
        day: Number(date.slice(8, 10)),
        inMonth: date >= firstOfMonth && date <= lastOfMonth,
        slots: occupiedSlots ? MEAL_SLOTS.filter((s) => occupiedSlots.has(s)) : [],
        kcal: dayNutrition ? Math.round(dayNutrition.total.kcal) : null,
      })
    }
    weeks.push(week)
  }

  return (
    <main className="view-enter flex flex-col gap-3 pb-4">
      <PlanLiveRefresh />
      {/* W8: subpantalla sin pestaña propia; vuelve a Plan. */}
      <ScreenHeader title={t('month')} backHref="/plan" />
      <MonthView month={month} weeks={weeks} todayIso={today} prevMonth={shiftMonth(month, -1)} nextMonth={shiftMonth(month, 1)} />
    </main>
  )
}
