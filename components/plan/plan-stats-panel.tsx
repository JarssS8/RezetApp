'use client'

import { useLocale, useTranslations } from 'next-intl'

export interface PlanStatsPanelProps {
  stats: {
    from: string
    to: string
    planned: number
    cooked: number
    skipped: number
    pending: number
    adherence: number | null
    plannedKcal: number
    cookedKcal: number
    cookedOffPlan: number
    topRecipes: { title: string; times: number }[]
  }
}

// Informativo, sin objetivos (respuesta 1 de AGENTS.md): dice qué pasó, no si
// estuvo bien. Sin barras de progreso ni semáforos por el mismo motivo.
export function PlanStatsPanel({ stats }: PlanStatsPanelProps) {
  const t = useTranslations('plan')
  const locale = useLocale()
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
  // `stats.from`/`stats.to` llegan como fecha ISO sin hora ('YYYY-MM-DD'): se
  // formatean con el locale del hogar en vez de enseñarlas crudas (fix 9 de
  // la revisión final). `timeZone: 'UTC'` evita que `new Date('YYYY-MM-DD')`
  // (medianoche UTC) se lea como el día anterior en un huso horario negativo.
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })

  const cards = [
    { key: 'planned', value: stats.planned },
    { key: 'cooked', value: stats.cooked },
    { key: 'skipped', value: stats.skipped },
    { key: 'pending', value: stats.pending },
  ] as const

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-text-2">{t('stats.range', { from: dateFormat.format(new Date(stats.from)), to: dateFormat.format(new Date(stats.to)) })}</p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((card) => (
          <li key={card.key} className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-text-2">{t(`stats.${card.key}`)}</p>
            <p className="tabular text-2xl font-medium">{card.value}</p>
          </li>
        ))}
      </ul>

      {stats.adherence === null ? (
        <p className="text-sm text-text-2">{t('stats.noData')}</p>
      ) : (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-xs text-text-2">{t('stats.adherence')}</p>
          <p className="tabular text-2xl font-medium text-acc-ink">{percent.format(stats.adherence)}</p>
        </div>
      )}

      <p className="text-sm text-text-2">{t('stats.kcal', { cooked: stats.cookedKcal, planned: stats.plannedKcal })}</p>
      <p className="text-sm text-text-2">{t('stats.offPlan', { count: stats.cookedOffPlan })}</p>

      {stats.topRecipes.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-text-2">{t('stats.top')}</h2>
          <ul className="flex flex-col gap-0.5">
            {stats.topRecipes.map((r) => (
              <li key={r.title} className="text-sm">
                {t.rich('stats.topLine', { title: r.title, times: r.times, name: (chunks) => <span>{chunks}</span> })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
