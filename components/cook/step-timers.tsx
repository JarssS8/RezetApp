'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TimerIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { detectTimers, timerMinutes } from '@/lib/domain'
import type { Locale } from '@/lib/domain/types'

export interface StepTimersProps {
  text: string
  locale: Locale
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Los tramos ("hornea 25 minutos") los detecta el dominio; aquí solo se pintan
// como botones y se cuenta atrás. Un temporizador a la vez: en la cocina el que
// importa es el del paso que tienes delante.
export function StepTimers({ text, locale }: StepTimersProps) {
  const t = useTranslations('cook')
  const spans = detectTimers(text, locale)
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (remaining === null) return
    if (remaining <= 0) return
    const id = setInterval(() => setRemaining((r) => (r === null ? null : Math.max(0, r - 1))), 1000)
    return () => clearInterval(id)
  }, [remaining])

  // Un texto de paso nuevo cancela el temporizador anterior (cambio de paso).
  const [lastText, setLastText] = useState(text)
  if (text !== lastText) {
    setLastText(text)
    setRemaining(null)
  }

  if (spans.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {spans.map((span) => (
        <Button
          key={`${span.start}-${span.end}`}
          type="button"
          variant="outline"
          size="lg"
          className="gap-1.5"
          onClick={() => setRemaining(span.seconds)}
        >
          <TimerIcon size={18} />
          {t('timerMinutes', { minutes: timerMinutes(span.seconds) })}
        </Button>
      ))}
      {remaining !== null ? (
        <output role="timer" aria-live="polite" className="tabular text-2xl font-medium">
          {mmss(remaining)}
        </output>
      ) : null}
      {remaining === 0 ? <span className="text-warn">{t('timerDone')}</span> : null}
    </div>
  )
}
