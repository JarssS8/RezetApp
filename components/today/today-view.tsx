'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { CookIcon, PlanIcon } from '@/components/icons'
import type { PlanEntryClient } from '@/components/plan/types'
import { EmptyState } from '@/components/ui/empty-state'
import { ScreenHeader } from '@/components/ui/screen-header'
import { WarnPanel } from '@/components/ui/warn-panel'
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
  progress: { date: string; plannedKcal: number; cookedKcal: number; hasEstimates: boolean; hasUnknownKcal: boolean }
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
  const locale = useLocale()

  useHouseholdEvents(
    useCallback(() => router.refresh(), [router]),
    ['plan.changed', 'pantry.changed', 'proposal.created', 'recipe.changed'],
  )

  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

  return (
    <main className="view-enter flex flex-col gap-5 pb-4">
      {/* W8: patrón único de cabecera. Hoy no tiene acción primaria ni menú:
          solo título y Ajustes (Auditoría W7, hallazgo 9.2, ahora vía ScreenHeader). */}
      <ScreenHeader title={t('title')} />

      <KcalRing
        plannedKcal={progress.plannedKcal}
        cookedKcal={progress.cookedKcal}
        isEstimated={progress.hasEstimates}
        hasUnknownKcal={progress.hasUnknownKcal}
        dateLabel={dateLabel}
      />

      {entries.length === 0 ? (
        // El vacío entero es la invitación: así el enlace conserva el nombre
        // accesible que ya tenía (today.emptyPlanLink) y e2e/today.spec.ts:9
        // sigue encontrándolo, sin añadir ni una clave.
        <Link href="/plan" className="view-enter block">
          <EmptyState icon={PlanIcon} title={t('emptyPlanLink')} />
        </Link>
      ) : (
        // view-enter también aquí (sweep §10): esta rama y la del vacío de
        // arriba son alternativas excluyentes; sin las dos, el intercambio
        // entre "nada planificado" y "hay comidas" (un evento SSE, por
        // ejemplo) se veía instantáneo al lado de todo lo demás que ya anima.
        <div className="view-enter flex flex-col gap-3">
          {MEAL_SLOTS.map((slot) => {
            const ofSlot = entries.filter((e) => e.slot === slot)
            if (ofSlot.length === 0) return null
            return (
              <section key={slot}>
                <h2 className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-text-2">
                  <span aria-hidden="true" className="h-4 w-1 rounded-pill bg-acc-line" />
                  {tp(`slots.${slot}`)}
                </h2>
                <ul className="flex flex-col gap-2">
                  {ofSlot.map((e) => (
                    <li key={e.id} className="flex min-h-14 items-center gap-3 rounded-md border border-line-2 bg-card px-3 shadow-card" data-status={e.status}>
                      <span className="flex-1 truncate font-medium">{e.title}</span>
                      <span className="tabular shrink-0 text-xs text-text-2">{tp('servingsShort', { n: e.servings })}</span>
                      {/* Este chip solo se pinta cuando está cocinado: sin
                          border-transparent, que competiría con el
                          border-color de pill-selected por la misma
                          propiedad (ver app/globals.css). */}
                      {e.status === 'cooked' ? (
                        <span className="rounded-pill border px-2 py-0.5 text-xs font-medium pill-selected">{tp('cooked')}</span>
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
        <WarnPanel title={t('expiring')}>
          <ul className="flex flex-col gap-1">
            {expiring.map((item) => (
              <li key={item.id} className="text-sm text-text-2">
                {item.daysToExpiry === null ? item.name : t('expiringLine', { name: item.name, days: item.daysToExpiry })}
              </li>
            ))}
          </ul>
        </WarnPanel>
      ) : null}

      <QuickActions aiEnabled={aiEnabled} date={date} />
    </main>
  )
}
