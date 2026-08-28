'use client'

import { useTranslations } from 'next-intl'
import { MinusIcon, PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

export interface ServingsStepperProps {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

// Stepper de raciones: botones ≥ 44px (min-h-11 min-w-11, regla táctil) y el
// número en fuente tabular para que no salte de ancho al cambiar de dígito.
export function ServingsStepper({ value, min = 1, max = 100, onChange }: ServingsStepperProps) {
  const t = useTranslations('recipes')

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('detail.fewer')}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <MinusIcon size={18} />
      </Button>
      {/* Cambio de valor con un fundido rápido (W6.5, §8): `key={value}`
          fuerza un remontaje del <span> en cada paso, y `starting:` (igual
          patrón que cook-session.tsx) lo hace entrar desde opacidad 0. 140ms
          -el presupuesto más corto-: es el stepper que más se toca con
          prisa, así que el fundido tiene que notarse sin frenar nada. */}
      <span key={value} className="tabular w-8 text-center text-xl font-medium transition-opacity duration-(--dur-1) ease-(--ease-out) starting:opacity-0">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('detail.more')}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon size={18} />
      </Button>
    </div>
  )
}
