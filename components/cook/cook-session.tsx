'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { buildIngredientRows, type DetailIngredient } from '@/components/recipes/ingredient-list'
import { ServingsStepper } from '@/components/recipes/servings-stepper'
import { Button } from '@/components/ui/button'
import { scaleRecipe } from '@/lib/domain'
import type { Locale, UnitSystem } from '@/lib/domain/types'
import type { MealSlot } from '@/lib/validation/plan'
import { FinishCookingDialog } from './finish-dialog'
import { IngredientChecklist } from './ingredient-checklist'
import { StepTimers } from './step-timers'
import { useWakeLock } from './use-wake-lock'

export interface CookStep {
  id: string
  index: number
  text: string
  timerSeconds: number | null
  imageUrl: string | null
}

export interface CookSessionProps {
  recipeId: string
  // null cuando se cocina desde una receta sin hueco en el plan: al terminar,
  // logCooked creará la entrada de hoy (§9.5, paso 1).
  entryId: string | null
  title: string
  servingsBase: number
  initialServings: number
  ingredients: DetailIngredient[]
  steps: CookStep[]
  locale: Locale
  units: UnitSystem
  // Hueco por defecto de las sobras al terminar (§9.5): el de la entrada si
  // ya hay una en el plan, o el que le tocaría a la hora actual si se cocina
  // "a pelo" desde la receta (slotForHour, calculado por la página).
  sourceSlot: MealSlot
}

// Un paso por pantalla. El escalado se recalcula EN EL CLIENTE con la misma
// función de dominio que usa el servidor (scaleRecipe): mover el contador de
// raciones con las manos pringadas tiene que ser instantáneo, y regla 1 de
// AGENTS.md garantiza que el número es idéntico al del servidor.
export function CookSession({ recipeId, entryId, title, servingsBase, initialServings, ingredients, steps, locale, units, sourceSlot }: CookSessionProps) {
  const t = useTranslations('cook')
  const [servings, setServings] = useState(initialServings)
  const [index, setIndex] = useState(0)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  // Mantiene la pantalla encendida mientras dura la sesión de cocina (spec §8).
  useWakeLock(true)

  const scaled = useMemo(() => scaleRecipe({ servingsBase, ingredients }, servings), [servingsBase, ingredients, servings])
  const rows = useMemo(() => buildIngredientRows(scaled, ingredients, locale, units), [scaled, ingredients, locale, units])

  const step = steps[index]
  // Ingredientes de este paso (recipe_ingredients.step_index); si la receta no
  // los reparte por pasos, se enseñan todos en el primero y ninguno después.
  const stepRows = useMemo(() => {
    const hasStepIndex = ingredients.some((i) => i.stepIndex !== null)
    const idsOfStep = new Set(ingredients.filter((i) => (hasStepIndex ? i.stepIndex === index : index === 0)).map((i) => i.id))
    return rows.filter((r) => idsOfStep.has(r.id))
  }, [ingredients, rows, index])

  // Ingredientes sin paso asignado cuando la receta reparte el resto: no
  // pertenecen a ninguno en concreto, así que se enseñan en todos (regla del
  // repaso de la Tarea 6: antes se perdían al no encajar en ningún índice).
  const unassignedRows = useMemo(() => {
    const hasStepIndex = ingredients.some((i) => i.stepIndex !== null)
    if (!hasStepIndex) return []
    const idsUnassigned = new Set(ingredients.filter((i) => i.stepIndex === null).map((i) => i.id))
    return rows.filter((r) => idsUnassigned.has(r.id))
  }, [ingredients, rows])

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Receta sin pasos: no hay nada que recorrer (repaso de la Tarea 6, antes no
  // se pintaba nada en absoluto).
  if (steps.length === 0) {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center gap-2 text-center text-text-2">
        <p>{t('noSteps')}</p>
      </section>
    )
  }

  return (
    <section
      className="flex min-h-[70dvh] flex-col gap-4"
      // Teclado (portátil apoyado en la encimera) y deslizamiento con el dedo:
      // las dos formas de pasar de paso sin apuntar a un botón pequeño con las
      // manos pringadas (spec §8, "swipe/teclas").
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setIndex((i) => Math.min(steps.length - 1, i + 1))
        if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      }}
      onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchStartX
        setTouchStartX(null)
        const end = e.changedTouches[0]?.clientX
        if (start === null || end === undefined) return
        const dx = end - start
        // 60 px de umbral: por debajo es un toque o un desplazamiento vertical.
        if (dx < -60) setIndex((i) => Math.min(steps.length - 1, i + 1))
        if (dx > 60) setIndex((i) => Math.max(0, i - 1))
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <h1 className="truncate font-display text-xl">{title}</h1>
        <ServingsStepper value={servings} onChange={setServings} />
      </header>

      <p className="tabular text-sm text-text-2">{t('stepOf', { current: index + 1, total: steps.length })}</p>

      {step ? <p className="text-2xl leading-snug">{step.text}</p> : null}

      {step ? <StepTimers text={step.text} locale={locale} stepIndex={index} timerSeconds={step.timerSeconds} /> : null}

      {stepRows.length > 0 ? <IngredientChecklist rows={stepRows} checked={checked} onToggle={toggle} /> : null}

      {unassignedRows.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-2">{t('unassigned')}</p>
          <IngredientChecklist rows={unassignedRows} checked={checked} onToggle={toggle} />
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="lg" disabled={index === 0} aria-label={t('previous')} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            <ChevronLeftIcon size={22} />
          </Button>
          <Button type="button" size="lg" disabled={index >= steps.length - 1} aria-label={t('next')} onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}>
            <ChevronRightIcon size={22} />
          </Button>
        </div>
        {index === steps.length - 1 ? <FinishCookingDialog recipeId={recipeId} entryId={entryId} servings={servings} sourceSlot={sourceSlot} /> : null}
      </div>
    </section>
  )
}
