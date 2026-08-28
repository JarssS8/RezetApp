'use client'

import { useTranslations } from 'next-intl'
import { WarningIcon } from '@/components/icons'
import type { IngredientRow } from '@/components/recipes/ingredient-list'
import { cn } from '@/lib/utils'

export interface IngredientChecklistProps {
  rows: IngredientRow[]
  checked: ReadonlySet<string>
  onToggle: (id: string) => void
}

// Lista de comprobación del paso: casillas de 44 px, tachado al marcar y el
// mismo ámbar de siempre para lo que no escala linealmente (docs/02-DISENO).
export function IngredientChecklist({ rows, checked, onToggle }: IngredientChecklistProps) {
  const t = useTranslations('cook')
  return (
    <ul aria-label={t('ingredients')} className="flex flex-col gap-1">
      {rows.map((row) => {
        const isChecked = checked.has(row.id)
        return (
          <li key={row.id}>
            <label className={cn('flex min-h-11 items-center gap-3 rounded-sm px-2', row.nonLinear && 'bg-warn-soft text-warn-ink', isChecked && 'opacity-60')}>
              <input type="checkbox" checked={isChecked} onChange={() => onToggle(row.id)} className="size-5 accent-primary" />
              {row.nonLinear ? <WarningIcon size={16} /> : null}
              <span className={cn('flex-1', isChecked && 'line-through')}>{row.name}</span>
              <span className="tabular shrink-0">{row.text}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
