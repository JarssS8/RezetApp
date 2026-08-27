import { useTranslations } from 'next-intl'

export interface KcalRingProps {
  plannedKcal: number
  cookedKcal: number
  isEstimated: boolean
}

const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Anillo informativo: cocinado sobre planificado de HOY. Sin objetivo diario ni
// diario alimentario (respuesta 1 de AGENTS.md). Sin librería de gráficos: dos
// círculos SVG y una máscara de trazo.
export function KcalRing({ plannedKcal, cookedKcal, isEstimated }: KcalRingProps) {
  const t = useTranslations('today')
  const ratio = plannedKcal > 0 ? Math.min(1, cookedKcal / plannedKcal) : 0
  const offset = CIRCUMFERENCE * (1 - ratio)

  return (
    <figure className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={t('ringLabel', { cooked: cookedKcal, planned: plannedKcal })}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--surf-2)" strokeWidth="8" />
        <circle
          data-testid="kcal-ring-progress"
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--acc)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <figcaption className="flex flex-col">
        <span className="tabular text-3xl font-medium">{cookedKcal}</span>
        <span className="tabular text-sm text-text-2">{t('ofPlanned', { planned: plannedKcal })}</span>
        {isEstimated ? <span className="text-xs text-text-2">{t('estimated')}</span> : null}
      </figcaption>
    </figure>
  )
}
