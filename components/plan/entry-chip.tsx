'use client'

import { useTranslations } from 'next-intl'
import { ClockIcon, LeftoversIcon, MinusIcon, PlusIcon, SkipIcon, TrashIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MealSlot } from '@/lib/validation/plan'
import { MEAL_SLOTS, type PlanEntryClient } from './types'

export interface EntryChipProps {
  entry: PlanEntryClient
  defaultServings: number
  onServingsChange: (id: string, servings: number) => void
  onSkip: (id: string, skipped: boolean) => void
  onRemove: (id: string) => void
  // Alternativa accesible al arrastrar y soltar: mover con teclado eligiendo
  // fecha y hueco en dos <select>. Opcional para no romper el chip "de solo
  // lectura" usado, por ejemplo, en el diff de una propuesta.
  days?: string[]
  onMove?: (id: string, date: string, slot: MealSlot) => void
}

// Chip de una entrada del plan: título, raciones, y chips de estado (sobra,
// saltada, presupuesto de tiempo). El stepper de raciones solo aparece cuando
// difiere de las raciones por defecto del hogar (spec §8).
export function EntryChip({ entry, defaultServings, onServingsChange, onSkip, onRemove, days, onMove }: EntryChipProps) {
  const t = useTranslations('plan')
  const skipped = entry.status === 'skipped'
  const cooked = entry.status === 'cooked'
  const nonDefaultServings = entry.servings !== defaultServings

  return (
    <div
      data-status={entry.status}
      className={cn('flex flex-col gap-1 rounded-md border border-border bg-card p-2 text-sm', skipped && 'opacity-60')}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('flex-1 truncate font-medium', skipped && 'line-through')}>{entry.title}</span>
        <span className="shrink-0 text-xs text-text-2">{t('servingsShort', { n: entry.servings })}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {entry.leftoverOfEntryId ? (
          <span title={t('leftover')} aria-label={t('leftover')} className="inline-flex items-center rounded-pill bg-secondary px-1.5 py-0.5 text-secondary-foreground">
            <LeftoversIcon size={14} />
          </span>
        ) : null}
        {cooked ? (
          <span className="inline-flex items-center rounded-pill bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{t('cooked')}</span>
        ) : null}
        {entry.timeBudgetMinutes !== null ? (
          <span className="inline-flex items-center gap-0.5 text-xs text-text-2" aria-label={t('timeBudget')}>
            <ClockIcon size={14} />
            {entry.timeBudgetMinutes}
          </span>
        ) : null}
        {nonDefaultServings ? (
          <span className="inline-flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('servings')}
              onClick={() => onServingsChange(entry.id, Math.max(1, entry.servings - 1))}
            >
              <MinusIcon size={12} />
            </Button>
            <span className="text-xs tabular-nums">{entry.servings}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('servings')}
              onClick={() => onServingsChange(entry.id, entry.servings + 1)}
            >
              <PlusIcon size={12} />
            </Button>
          </span>
        ) : null}
        {onMove && days ? (
          <span className="flex items-center gap-1">
            <select
              aria-label={t('moveDate')}
              value={entry.date}
              onChange={(e) => onMove(entry.id, e.target.value, entry.slot)}
              className="h-11 rounded-sm border border-border bg-transparent px-1 text-xs"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              aria-label={t('moveSlot')}
              value={entry.slot}
              onChange={(e) => onMove(entry.id, entry.date, e.target.value as MealSlot)}
              className="h-11 rounded-sm border border-border bg-transparent px-1 text-xs"
            >
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {t(`slots.${s}`)}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={skipped ? t('unskip') : t('skip')}
          aria-pressed={skipped}
          onClick={() => onSkip(entry.id, !skipped)}
        >
          <SkipIcon size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={t('remove')} onClick={() => onRemove(entry.id)}>
          <TrashIcon size={14} />
        </Button>
      </div>
    </div>
  )
}
