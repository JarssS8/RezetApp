import { useLocale, useTranslations } from 'next-intl'

export interface KcalRingProps {
  plannedKcal: number
  cookedKcal: number
  isEstimated: boolean
  hasUnknownKcal?: boolean
  dateLabel: string
}

const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Anillo informativo: cocinado sobre planificado de HOY. Sin objetivo diario ni
// diario alimentario (respuesta 1 de AGENTS.md). Sin librería de gráficos: dos
// círculos SVG y una máscara de trazo.
//
// Desde W6 es el hero de la pantalla: superficie de acento suave, la fecha
// arriba y la cifra en la voz display (Outfit), no en la monoespaciada. Es el
// único dato de la app que se pinta así de grande; el resto de cifras siguen
// en columna con .tabular.
export function KcalRing({ plannedKcal, cookedKcal, isEstimated, hasUnknownKcal, dateLabel }: KcalRingProps) {
  const t = useTranslations('today')
  const locale = useLocale()
  // useGrouping: 'always' porque el CLDR de "es" agrupa a partir de dos
  // dígitos antes del separador (min2): sin esto, 2000 kcal saldría "2000" en
  // vez de "2.000" y la cifra grande del hero se leería mal de un vistazo.
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: 'always' })
  const ratio = plannedKcal > 0 ? Math.min(1, cookedKcal / plannedKcal) : 0
  const offset = CIRCUMFERENCE * (1 - ratio)

  return (
    <figure className="flex flex-col gap-3 rounded-lg bg-acc-soft p-4 shadow-hero">
      <figcaption className="text-sm font-medium text-text-2 capitalize">{dateLabel}</figcaption>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={t('ringLabel', { cooked: nf.format(cookedKcal), planned: nf.format(plannedKcal) })}>
          {/* Auditoría W7, hallazgo 10.2: --surf (y antes --surf-2) daban
              1,00–1,23:1 sobre --acc-soft en los ocho acentos — la pista era
              casi invisible. --text-2 es el único token comprobado (aparte de
              --acc-ink, reservado para la parte llena) que llega a ≥1,5:1 de
              verdad: --acc-line, el candidato obvio, se queda en 1,32–1,73:1
              según el acento y no lo garantiza. Sigue siendo decoración — el
              valor lo dicen el aria-label y la cifra —, pero ahora se ve. */}
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--text-2)" strokeWidth="8" />
          <circle
            data-testid="kcal-ring-progress"
            className="transition-[stroke-dashoffset] duration-(--dur-3) ease-(--ease-out)"
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
        <div className="flex flex-col">
          {/* Animación #1 del informe: hasta W6 el anillo saltaba al valor nuevo
              al cocinar o al llegar un evento SSE. 500 ms, solo strokeDashoffset,
              nunca el color. El interruptor global de accesibilidad de
              app/globals.css ya lo anula. */}
          <span className="num-hero">{nf.format(cookedKcal)}</span>
          <span className="tabular text-sm text-text-2">{t('ofPlanned', { planned: nf.format(plannedKcal) })}</span>
          {isEstimated ? <span className="text-xs text-text-2">{t('estimated')}</span> : null}
          {hasUnknownKcal ? <span className="text-xs text-text-2">{t('unknownKcal')}</span> : null}
        </div>
      </div>
    </figure>
  )
}
