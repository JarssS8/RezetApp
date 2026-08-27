'use client'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useTranslations } from 'next-intl'
import { PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MealSlot } from '@/lib/validation/plan'
import { EntryChip } from './entry-chip'
import { MEAL_SLOTS, type PlanEntryClient } from './types'

export interface DayColumnProps {
  date: string
  isToday: boolean
  kcal: number | null
  defaultServings: number
  days: string[]
  entriesBySlot: Record<MealSlot, PlanEntryClient[]>
  onAdd: (date: string, slot: MealSlot) => void
  onServingsChange: (id: string, servings: number) => void
  onSkip: (id: string, skipped: boolean) => void
  onRemove: (id: string) => void
  onMove: (id: string, date: string, slot: MealSlot) => void
}

interface ChipCallbacks {
  defaultServings: number
  days: string[]
  onServingsChange: (id: string, servings: number) => void
  onSkip: (id: string, skipped: boolean) => void
  onRemove: (id: string) => void
  onMove: (id: string, date: string, slot: MealSlot) => void
}

// Envuelve EntryChip con useDraggable: el arrastre lo gestiona el DndContext
// de WeekView; aquí solo se conectan el nodo, los listeners táctiles/puntero
// y la posición mientras se arrastra.
function DraggableChip({ entry, ...callbacks }: { entry: PlanEntryClient } & ChipCallbacks) {
  const t = useTranslations('plan')
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    data: { date: entry.date, slot: entry.slot },
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  // Se mantiene el aria-roledescription por defecto de dnd-kit ("draggable");
  // nuestra pista (dragHint) se añade como descripción adicional, sin pisar
  // la descripción propia de dnd-kit (instrucciones de teclado).
  const hintId = `plan-drag-hint-${entry.id}`
  const describedBy = [attributes['aria-describedby'], hintId].filter(Boolean).join(' ')
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} aria-describedby={describedBy} className={cn('touch-none', isDragging && 'opacity-50')}>
      <span id={hintId} className="sr-only">
        {t('dragHint')}
      </span>
      <EntryChip entry={entry} {...callbacks} />
    </div>
  )
}

function SlotCell({
  date,
  slot,
  entries,
  onAdd,
  ...callbacks
}: { date: string; slot: MealSlot; entries: PlanEntryClient[]; onAdd: (date: string, slot: MealSlot) => void } & ChipCallbacks) {
  const t = useTranslations('plan')
  const { setNodeRef, isOver } = useDroppable({ id: `${date}:${slot}`, data: { date, slot } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[4.5rem] flex-col gap-1.5 rounded-md border border-dashed border-border/70 p-1.5',
        isOver && 'border-primary bg-accent/40',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-2">{t(`slots.${slot}`)}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={t('addTo', { slot: t(`slots.${slot}`) })} onClick={() => onAdd(date, slot)}>
          <PlusIcon size={14} />
        </Button>
      </div>
      {entries.map((entry) => (
        <DraggableChip key={entry.id} entry={entry} {...callbacks} />
      ))}
    </div>
  )
}

export function DayColumn({ date, isToday, kcal, onAdd, entriesBySlot, ...callbacks }: DayColumnProps) {
  const t = useTranslations('plan')
  const label = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex items-center justify-between rounded-sm px-1.5 py-1', isToday && 'bg-accent text-accent-foreground')}>
        <span className="text-sm font-medium capitalize">{label}</span>
        {isToday ? <span className="text-xs">{t('today')}</span> : null}
      </div>
      {kcal !== null ? <p className="px-1.5 text-xs tabular text-text-2">{t('kcalDay', { kcal })}</p> : null}
      {MEAL_SLOTS.map((slot) => (
        <SlotCell key={slot} date={date} slot={slot} entries={entriesBySlot[slot]} onAdd={onAdd} {...callbacks} />
      ))}
    </div>
  )
}
