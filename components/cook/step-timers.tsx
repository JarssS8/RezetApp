'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon, TimerIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { detectTimers, timerMinutes } from '@/lib/domain'
import type { Locale } from '@/lib/domain/types'
import { cn } from '@/lib/utils'
import { playAlarm } from './alarm'
import { useTimers } from './use-timers'

export interface StepTimersProps {
  text: string
  locale: Locale
  stepIndex: number
  // recipe_steps.timer_seconds: el temporizador que el autor de la receta puso
  // a mano. Hasta W4 se ignoraba y solo se usaban los detectados en el texto.
  timerSeconds: number | null
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Los tramos ("hornea 25 minutos") los detecta el dominio; aquí solo se pintan
// como botones. El estado vive en useTimers, fuera del componente: así los
// temporizadores sobreviven al cambio de paso (el arroz sigue contando
// mientras lees el paso siguiente) y pueden correr varios a la vez.
export function StepTimers({ text, locale, stepIndex, timerSeconds }: StepTimersProps) {
  const t = useTranslations('cook')
  const onFinish = useCallback(() => playAlarm(), [])
  const { timers, start, toggle, reset, dismiss } = useTimers(onFinish)

  const spans = detectTimers(text, locale)
  const runningIds = new Set(timers.map((timer) => timer.id))
  // Un tramo ya arrancado deja de ofrecerse como botón: si no, "25 min" y
  // "5 min" conviven en pantalla y el texto del segundo es subcadena del
  // primero, ambiguo para el lector de pantalla y para quien pulsa. Arrancar
  // de nuevo pasa por quitar el temporizador primero (dismiss).
  const offers = [
    ...(timerSeconds !== null ? [{ id: `s${stepIndex}-explicit`, seconds: timerSeconds }] : []),
    ...spans.map((span) => ({ id: `s${stepIndex}-${span.start}-${span.end}`, seconds: span.seconds })),
  ].filter((offer) => !runningIds.has(offer.id))

  if (offers.length === 0 && timers.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {offers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {offers.map((offer) => (
            <Button
              key={offer.id}
              type="button"
              variant="outline"
              size="lg"
              className="gap-1.5"
              onClick={() => start(offer.id, offer.seconds, t('timerMinutes', { minutes: timerMinutes(offer.seconds) }))}
            >
              <TimerIcon size={18} />
              {t('timerMinutes', { minutes: timerMinutes(offer.seconds) })}
            </Button>
          ))}
        </div>
      ) : null}

      {timers.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-3">
          {timers.map((timer) => (
            <li key={timer.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <output role="status" aria-live="polite" className={cn('tabular text-2xl font-medium', timer.remaining === 0 && 'text-warn')}>
                {timer.remaining === 0 ? t('timerDone') : mmss(timer.remaining)}
              </output>
              {timer.remaining > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => toggle(timer.id)}>
                  {timer.running ? t('timerPause') : t('timerResume')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => reset(timer.id)}>
                {t('timerReset')}
              </Button>
              <Button type="button" variant="outline" size="sm" aria-label={t('timerDismiss')} onClick={() => dismiss(timer.id)}>
                {/* el nombre accesible va en aria-label: react/jsx-no-literals prohíbe un texto suelto aquí */}
                <CloseIcon size={16} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
