'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CookIcon, WarningIcon } from '@/components/icons'
import type { PlanEntryClient } from '@/components/plan/types'
import { useHouseholdEvents } from '@/lib/events/use-household-events'
import { MEAL_SLOTS } from '@/lib/domain'
import { KcalRing } from './kcal-ring'
import { QuickActions } from './quick-actions'

export interface ExpiringItem {
  id: string
  name: string
  daysToExpiry: number | null
}

export interface TodayViewProps {
  date: string
  entries: PlanEntryClient[]
  progress: { date: string; plannedKcal: number; cookedKcal: number; hasEstimates: boolean }
  expiring: ExpiringItem[]
  aiEnabled: boolean
}

// Hoy responde "¿qué ceno?" sin tocar nada (docs/01-PRODUCTO). Se refresca sola
// con los eventos del hogar (spec §14): otro móvil de la casa marca la comida
// como cocinada y este anillo se mueve sin recargar.
export function TodayView({ date, entries, progress, expiring, aiEnabled }: TodayViewProps) {
  const t = useTranslations('today')
  const tp = useTranslations('plan')
  const c = useTranslations('common')
  const router = useRouter()

  useHouseholdEvents(
    useCallback(() => router.refresh(), [router]),
    ['plan.changed', 'pantry.changed', 'proposal.created', 'recipe.changed'],
  )

  return (
    <main className="flex flex-col gap-5 pb-4">
      <h1 className="text-2xl">{t('title')}</h1>

      <KcalRing plannedKcal={progress.plannedKcal} cookedKcal={progress.cookedKcal} isEstimated={progress.hasEstimates} />

      {entries.length === 0 ? (
        <p className="text-sm text-text-2">
          <Link href="/plan" className="font-medium text-acc-ink underline">
            {t('emptyPlanLink')}
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {MEAL_SLOTS.map((slot) => {
            const ofSlot = entries.filter((e) => e.slot === slot)
            if (ofSlot.length === 0) return null
            return (
              <section key={slot}>
                <h2 className="text-sm font-semibold text-text-2">{tp(`slots.${slot}`)}</h2>
                <ul className="mt-1 flex flex-col gap-2">
                  {ofSlot.map((e) => (
                    <li key={e.id} className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-card px-3" data-status={e.status}>
                      <span className="flex-1 truncate font-medium">{e.title}</span>
                      <span className="tabular shrink-0 text-xs text-text-2">{tp('servingsShort', { n: e.servings })}</span>
                      {e.status === 'cooked' ? (
                        <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-xs text-primary">{tp('cooked')}</span>
                      ) : e.recipeId && !e.leftoverOfEntryId ? (
                        <Link href={`/cook/${e.id}`} aria-label={c('nav.cook')} className="inline-flex min-h-11 min-w-11 items-center justify-center">
                          <CookIcon size={20} />
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {expiring.length > 0 ? (
        <section className="rounded-lg border border-warn/40 bg-warn-soft p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-warn">
            <WarningIcon size={18} />
            {t('expiring')}
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {expiring.map((item) => (
              <li key={item.id} className="text-sm text-text-2">
                {item.daysToExpiry === null ? item.name : t('expiringLine', { name: item.name, days: item.daysToExpiry })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <QuickActions aiEnabled={aiEnabled} date={date} />
    </main>
  )
}
