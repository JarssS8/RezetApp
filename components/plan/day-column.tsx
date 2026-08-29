'use client'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useLocale, useTranslations } from 'next-intl'
import { PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { MEAL_SLOTS } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { MealSlot } from '@/lib/validation/plan'
import { EntryChip } from './entry-chip'
import type { PlanEntryClient } from './types'

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
  // Mientras se arrastra, el chip sigue al dedo 1:1 (sin transición: cualquier
  // suavizado se siente como retardo). Al soltar, `transform` pasa a undefined
  // y hasta W6 el chip se teletransportaba; ahora asienta en 200 ms.
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : { transition: 'transform var(--dur-2) var(--ease-out)' }
  // Se mantiene el aria-roledescription por defecto de dnd-kit ("draggable");
  // nuestra pista (dragHint) se añade como descripción adicional, sin pisar
  // la descripción propia de dnd-kit (instrucciones de teclado).
  const hintId = `plan-drag-hint-${entry.id}`
  const describedBy = [attributes['aria-describedby'], hintId].filter(Boolean).join(' ')
  // No se propagan `role`/`tabIndex` de dnd-kit: sin KeyboardSensor registrado
  // (ver week-view.tsx), ese role="button" + tabIndex=0 anuncia instrucciones
  // de teclado que no funcionan y mete el chip (que ya contiene botones y
  // selects reales) en el orden de tabulación como si fuera interactivo.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se descartan a propósito, ver comentario de arriba
  const { role: _role, tabIndex: _tabIndex, ...a11yAttributes } = attributes
  return (
    <div ref={setNodeRef} style={style} {...a11yAttributes} {...listeners} aria-describedby={describedBy} className={cn('touch-none', isDragging && 'opacity-50')}>
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
        // Superficie hundida en vez de punteado: veintiocho de estos en
        // pantalla, y el punteado gris es lo que hacía que el plan pareciera un
        // wireframe sin terminar.
        'flex min-h-[4.5rem] flex-col gap-1.5 rounded-md border border-transparent bg-surface-sunken p-1.5',
        // Animación #3 (informe de animaciones): el resaltado del destino se
        // enciende en 140 ms (--dur-1) en vez de saltar. Solo colores.
        'transition-colors duration-(--dur-1) ease-out',
        isOver && 'border-acc-line bg-acc-soft',
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
  // useLocale() en vez de `undefined`: la única llamada del repo que dejaba
  // el locale a la implementación del motor JS en vez del idioma del hogar.
  // Con `undefined` el nombre del día salía en el idioma del navegador/servidor,
  // no en el elegido en ajustes, y además rompía la hidratación cuando ambos
  // discrepaban (el server rinde con uno y el cliente con otro).
  const locale = useLocale()
  const label = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid={isToday ? 'today-column' : undefined}
        // Ramas excluyentes (precedente: bottom-bar.tsx): pill-selected y
        // border-transparent nunca van juntas porque las dos tocan
        // border-color y un empate en la hoja compilada no depende del orden
        // de las clases en el JSX.
        className={cn('flex items-center justify-between rounded-sm border px-1.5 py-1', isToday ? 'pill-selected' : 'border-transparent')}
      >
        <span className="text-sm font-medium capitalize">{label}</span>
        {isToday ? <span className="text-xs font-semibold">{t('today')}</span> : null}
      </div>
      {kcal !== null ? <p className="px-1.5 text-xs tabular text-text-2">{t('kcalDay', { kcal })}</p> : null}
      {MEAL_SLOTS.map((slot) => (
        <SlotCell key={slot} date={date} slot={slot} entries={entriesBySlot[slot]} onAdd={onAdd} {...callbacks} />
      ))}
    </div>
  )
}
