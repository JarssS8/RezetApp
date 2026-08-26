'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { applyPlanBatchAction, movePlanEntryAction, patchPlanEntryAction } from '@/lib/actions/plan'
import { useHouseholdEvents } from '@/lib/events/use-household-events'
import { addDays } from '@/lib/plan-dates'
import type { MealSlot } from '@/lib/validation/plan'
import { AddEntrySheet } from './add-entry-sheet'
import { DayColumn } from './day-column'
import { MEAL_SLOTS, type PlanEntryClient } from './types'

export interface WeekViewProps {
  monday: string
  days: string[]
  entries: PlanEntryClient[]
  defaultServings: number
  kcalByDate: Record<string, number>
  todayIso: string
  // Preselección desde ?add=<recipeId>&servings=N (enlace desde el detalle de receta)
  initialAddRecipeId: string | null
  initialAddServings: number
}

interface SheetTarget {
  date: string
  slot: MealSlot
}

const DRAG_ACTIVATION = { delay: 150, tolerance: 5 }

export function WeekView({ monday, days, entries: initialEntries, defaultServings, kcalByDate, todayIso, initialAddRecipeId, initialAddServings }: WeekViewProps) {
  const t = useTranslations('plan')
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  // Sincroniza el estado local (con optimismo) con la prop del servidor cuando
  // cambia (p. ej. tras router.refresh()). Ajuste durante el render, no en un
  // efecto: es el patrón recomendado para "reiniciar estado cuando cambia una prop".
  const [syncedEntries, setSyncedEntries] = useState(initialEntries)
  if (syncedEntries !== initialEntries) {
    setSyncedEntries(initialEntries)
    setEntries(initialEntries)
  }

  // La preselección de ?add=<recipeId> solo debe aplicar a la primera
  // apertura de la hoja; si el usuario la cierra y pulsa otro "+", no debe
  // reaparecer la receta del enlace.
  const [pendingAdd, setPendingAdd] = useState(initialAddRecipeId ? { recipeId: initialAddRecipeId, servings: initialAddServings || defaultServings } : null)
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(pendingAdd ? { date: todayIso, slot: 'lunch' } : null)
  // Cambia en cada apertura del sheet para forzar su remonte (estado interno limpio)
  const [sheetSeq, setSheetSeq] = useState(0)

  useHouseholdEvents(() => router.refresh(), ['plan.changed', 'proposal.created'])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: DRAG_ACTIVATION }),
  )

  const byDaySlot = useMemo(() => {
    const map = new Map<string, PlanEntryClient[]>()
    for (const e of entries) {
      const key = `${e.date}:${e.slot}`
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder)
    return map
  }, [entries])

  function entriesFor(date: string): Record<MealSlot, PlanEntryClient[]> {
    const result = {} as Record<MealSlot, PlanEntryClient[]>
    for (const slot of MEAL_SLOTS) result[slot] = byDaySlot.get(`${date}:${slot}`) ?? []
    return result
  }

  // Aplica un cambio local (optimista), llama a la acción y, si falla,
  // revierte y avisa por toast. `mutate` describe el cambio local a partir
  // del estado previo; `run` es la llamada al servidor.
  async function withOptimism(mutate: (prev: PlanEntryClient[]) => PlanEntryClient[], run: () => Promise<{ ok: boolean }>) {
    const prev = entries
    setEntries(mutate(prev))
    const result = await run()
    if (!result.ok) {
      setEntries(prev)
      toast.error(t('errors.move'))
      return
    }
    router.refresh()
  }

  function move(id: string, date: string, slot: MealSlot) {
    const target = byDaySlot.get(`${date}:${slot}`) ?? []
    const sortOrder = target.filter((e) => e.id !== id).length
    void withOptimism(
      (prev) => prev.map((e) => (e.id === id ? { ...e, date, slot, sortOrder } : e)),
      () => movePlanEntryAction({ entryId: id, date, slot, sortOrder }),
    )
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const [date, slot] = String(over.id).split(':') as [string, MealSlot]
    const activeData = active.data.current as { date: string; slot: MealSlot } | undefined
    if (activeData && activeData.date === date && activeData.slot === slot) return
    move(String(active.id), date, slot)
  }

  function servingsChange(id: string, servings: number) {
    void withOptimism(
      (prev) => prev.map((e) => (e.id === id ? { ...e, servings } : e)),
      () => patchPlanEntryAction(id, { servings }),
    )
  }

  function skip(id: string, skipped: boolean) {
    void withOptimism(
      (prev) => prev.map((e) => (e.id === id ? { ...e, status: skipped ? 'skipped' : 'planned' } : e)),
      () => patchPlanEntryAction(id, { skipped }),
    )
  }

  function remove(id: string) {
    void withOptimism(
      (prev) => prev.filter((e) => e.id !== id),
      () => applyPlanBatchAction({ add: [], remove: [id] }),
    )
  }

  const prevWeek = addDays(monday, -7)
  const nextWeek = addDays(monday, 7)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon-sm" aria-label={t('prevWeek')} render={<Link href={`/plan?week=${prevWeek}`} />}>
          <ChevronLeftIcon size={18} />
        </Button>
        <Link href={`/plan?week=${todayIso}`} className="inline-flex min-h-11 items-center rounded-sm border border-border px-3 text-sm font-medium">
          {t('today')}
        </Link>
        <Button variant="outline" size="icon-sm" aria-label={t('nextWeek')} render={<Link href={`/plan?week=${nextWeek}`} />}>
          <ChevronRightIcon size={18} />
        </Button>
      </div>

      {entries.length === 0 ? <p className="text-sm text-text-2">{t('empty')}</p> : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((date) => (
            <DayColumn
              key={date}
              date={date}
              isToday={date === todayIso}
              kcal={kcalByDate[date] ?? null}
              defaultServings={defaultServings}
              days={days}
              entriesBySlot={entriesFor(date)}
              onAdd={(d, slot) => {
                setPendingAdd(null)
                setSheetTarget({ date: d, slot })
                setSheetSeq((s) => s + 1)
              }}
              onServingsChange={servingsChange}
              onSkip={skip}
              onRemove={remove}
              onMove={move}
            />
          ))}
        </div>
      </DndContext>

      <AddEntrySheet
        key={sheetSeq}
        open={sheetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSheetTarget(null)
            setPendingAdd(null)
          }
        }}
        days={days}
        defaultDate={sheetTarget?.date ?? todayIso}
        defaultSlot={sheetTarget?.slot ?? 'lunch'}
        initialRecipeId={pendingAdd?.recipeId ?? null}
        initialServings={pendingAdd?.servings ?? defaultServings}
        onAdded={() => {
          setSheetTarget(null)
          setPendingAdd(null)
          router.refresh()
        }}
      />
    </div>
  )
}
