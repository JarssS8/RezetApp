'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { weekRange } from '@/lib/plan-dates'
import { cn } from '@/lib/utils'
import type { MealSlot } from '@/lib/validation/plan'

export interface MonthDayCell {
  date: string
  day: number
  inMonth: boolean
  // Huecos ocupados ese día, ya deduplicados y en orden de slot (lo decide
  // quien construye la vista: la page, que tiene acceso al servicio).
  slots: MealSlot[]
  kcal: number | null
}

export interface MonthViewProps {
  month: string
  // 6 semanas × 7 días, empezando en lunes; cada fila ya alineada así que
  // week[0] es el lunes de esa fila (clave para el enlace a /plan?week=).
  weeks: MonthDayCell[][]
  todayIso: string
  prevMonth: string
  nextMonth: string
}

// Vista mensual: rejilla 6×7 con un punto por hueco ocupado del día y sus
// kcal totales; pulsar un día navega a la vista semanal que lo contiene.
export function MonthView({ weeks, todayIso, prevMonth, nextMonth }: MonthViewProps) {
  const t = useTranslations('plan')
  const weekOfToday = weekRange(todayIso).from

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/plan/month?month=${prevMonth}`}
          aria-label={t('prevMonth')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <Link href={`/plan?week=${weekOfToday}`} className="inline-flex min-h-11 items-center rounded-sm border border-border px-3 text-sm font-medium">
          {t('week')}
        </Link>
        <Link
          href={`/plan/month?month=${nextMonth}`}
          aria-label={t('nextMonth')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border"
        >
          <ChevronRightIcon size={18} />
        </Link>
      </div>

      <div data-testid="month-grid" className="grid grid-cols-7 gap-1.5">
        {weeks.map((week) =>
          week.map((cell) => {
            const monday = week[0]?.date ?? cell.date
            return (
              <Link
                key={cell.date}
                data-testid={`day-${cell.date}`}
                href={`/plan?week=${monday}`}
                className={cn(
                  'flex min-h-[4.5rem] flex-col gap-1 rounded-sm border border-border p-1.5',
                  !cell.inMonth && 'opacity-40',
                  cell.date === todayIso && 'border-primary bg-accent',
                )}
              >
                <span className="text-sm font-medium tabular">{cell.day}</span>
                {cell.slots.length > 0 ? (
                  <span data-testid={`meals-${cell.date}`} aria-label={t('plannedMeals', { n: cell.slots.length })} className="flex gap-0.5">
                    {cell.slots.map((slot) => (
                      <span key={slot} data-testid="meal-dot" className="h-1.5 w-1.5 rounded-pill bg-primary" />
                    ))}
                  </span>
                ) : null}
                {cell.kcal !== null ? <span className="text-xs tabular text-text-2">{t('kcalDay', { kcal: cell.kcal })}</span> : null}
              </Link>
            )
          }),
        )}
      </div>
    </div>
  )
}
