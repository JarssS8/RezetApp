'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CookIcon, VolumeIcon, VolumeOffIcon } from '@/components/icons'
import { buildIngredientRows, type DetailIngredient } from '@/components/recipes/ingredient-list'
import { ServingsStepper } from '@/components/recipes/servings-stepper'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { scaleRecipe } from '@/lib/domain'
import type { Locale, UnitSystem } from '@/lib/domain/types'
import { cn } from '@/lib/utils'
import type { MealSlot } from '@/lib/validation/plan'
import { FinishCookingDialog } from './finish-dialog'
import { IngredientChecklist } from './ingredient-checklist'
import { StepTimers } from './step-timers'
import { useSpeech } from './use-speech'
import { useWakeLock } from './use-wake-lock'

// Clave de localStorage para el modo pared: preferencia por dispositivo (el
// móvil de la mano y la tablet de la pared quieren cosas distintas), no del
// hogar — por eso no vive en la base de datos.
const WALL_KEY = 'rz.cookWall'

// Almacén externo minúsculo sobre localStorage: useSyncExternalStore, igual
// que useSpeech con "supported", evita el desajuste de hidratación (SSR no
// tiene localStorage) sin llamar a setState desde un efecto.
const wallListeners = new Set<() => void>()
let wallCache = false

function getWallSnapshot(): boolean {
  try {
    wallCache = window.localStorage.getItem(WALL_KEY) === '1'
  } catch {
    // modo privado o almacenamiento bloqueado: se cocina en modo normal
  }
  return wallCache
}

function getWallServerSnapshot(): boolean {
  return false
}

function subscribeWall(listener: () => void): () => void {
  wallListeners.add(listener)
  return () => wallListeners.delete(listener)
}

function setWallPreference(next: boolean): void {
  try {
    window.localStorage.setItem(WALL_KEY, next ? '1' : '0')
  } catch {
    // no poder recordarlo no impide usarlo en esta sesión
  }
  wallCache = next
  wallListeners.forEach((listener) => listener())
}

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
  const c = useTranslations('common')
  const [servings, setServings] = useState(initialServings)
  const [index, setIndex] = useState(0)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const wall = useSyncExternalStore(subscribeWall, getWallSnapshot, getWallServerSnapshot)

  // Mantiene la pantalla encendida mientras dura la sesión de cocina (spec §8).
  useWakeLock(true)

  function toggleWall() {
    setWallPreference(!wall)
  }

  const speech = useSpeech(locale)

  // Cambiar de paso mientras habla debe callar la voz: si no, se solapan el
  // audio del paso anterior y el texto del siguiente en pantalla.
  const goTo = useCallback(
    (next: (i: number) => number) => {
      speech.stop()
      setIndex((i) => Math.min(steps.length - 1, Math.max(0, next(i))))
    },
    [speech, steps.length],
  )

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
  // se pintaba nada en absoluto). Sin `data-fullscreen`: el vacío se queda
  // dentro del marco de la app, con la barra inferior, para que no sea un
  // callejón sin salida.
  if (steps.length === 0) {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center">
        <EmptyState icon={CookIcon} title={t('noSteps')} />
      </section>
    )
  }

  return (
    <section
      data-fullscreen="true"
      data-wall={wall ? 'true' : undefined}
      // Pantalla completa de verdad (docs/02-DISENO, "Modo cocina"): el marco de
      // la app se aparta al ver este data-fullscreen (app/(app)/layout.tsx), sin
      // layout paralelo. El modo pared cambia además el lienzo, no solo el
      // cuerpo de letra: fondo hundido y más aire para leer a dos metros.
      className={cn(
        'flex min-h-dvh flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]',
        wall ? 'bg-surface-sunken gap-6 px-8' : 'mx-auto w-full max-w-xl',
      )}
      // Teclado (portátil apoyado en la encimera) y deslizamiento con el dedo:
      // las dos formas de pasar de paso sin apuntar a un botón pequeño con las
      // manos pringadas (spec §8, "swipe/teclas").
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goTo((i) => i + 1)
        if (e.key === 'ArrowLeft') goTo((i) => i - 1)
      }}
      onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchStartX
        setTouchStartX(null)
        const end = e.changedTouches[0]?.clientX
        if (start === null || end === undefined) return
        const dx = end - start
        // 60 px de umbral: por debajo es un toque o un desplazamiento vertical.
        if (dx < -60) goTo((i) => i + 1)
        if (dx > 60) goTo((i) => i - 1)
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <h1 className={cn('title-content truncate', wall && 'text-3xl')}>{title}</h1>
        <div className="flex items-center gap-2">
          {speech.supported ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              aria-label={speech.speaking ? t('speakStop') : t('speak')}
              aria-pressed={speech.speaking}
              onClick={() => (speech.speaking ? speech.stop() : speech.speak(step?.text ?? ''))}
            >
              {speech.speaking ? <VolumeOffIcon size={20} /> : <VolumeIcon size={20} />}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="lg" aria-pressed={wall} aria-label={wall ? t('wallOff') : t('wallOn')} onClick={toggleWall}>
            <CookIcon size={20} />
          </Button>
          <ServingsStepper value={servings} onChange={setServings} />
          <Button type="button" variant="ghost" size="icon" aria-label={c('actions.close')} render={<Link href="/cook" />}>
            <CloseIcon size={20} />
          </Button>
        </div>
      </header>

      {/* Un punto por paso, el actual en acento: se lee de un vistazo desde el
          otro lado de la encimera. El texto de siempre se queda como nombre
          accesible de la barra, así que ningún lector de pantalla pierde nada. */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuenow={index + 1}
        aria-valuemax={steps.length}
        aria-label={t('stepOf', { current: index + 1, total: steps.length })}
        className="flex items-center gap-1.5"
      >
        {steps.map((s, i) => (
          <span key={s.id} aria-hidden="true" className={cn('h-1.5 flex-1 rounded-pill', i <= index ? 'bg-primary' : 'bg-surface-sunken')} />
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line-2 bg-card p-4 shadow-card">
        {step ? (
          // Animación #4: el bloque entra con @starting-style desde opacidad 0.
          // 140 ms y solo opacidad: se toca decenas de veces por sesión y con las
          // manos mojadas, así que tiene que ser casi imperceptible. La `key`
          // fuerza el remontaje por paso, que es lo que dispara la entrada.
          <div key={step.id} className="flex flex-col gap-4 transition-opacity duration-(--dur-1) ease-(--ease-out) starting:opacity-0">
            <p data-testid="cook-step" className={cn('text-balance leading-snug', wall ? 'text-4xl' : 'text-2xl')}>
              {step.text}
            </p>
            <StepTimers text={step.text} locale={locale} stepIndex={index} timerSeconds={step.timerSeconds} />
          </div>
        ) : null}
      </div>

      {wall || stepRows.length > 0 ? <IngredientChecklist rows={stepRows} checked={checked} onToggle={toggle} /> : null}

      {unassignedRows.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-2">{t('unassigned')}</p>
          <IngredientChecklist rows={unassignedRows} checked={checked} onToggle={toggle} />
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="lg" disabled={index === 0} aria-label={t('previous')} onClick={() => goTo((i) => i - 1)}>
            <ChevronLeftIcon size={22} />
          </Button>
          <Button type="button" variant="default" size="lg" disabled={index >= steps.length - 1} aria-label={t('next')} onClick={() => goTo((i) => i + 1)}>
            <ChevronRightIcon size={22} />
          </Button>
        </div>
        {index === steps.length - 1 ? <FinishCookingDialog recipeId={recipeId} entryId={entryId} servings={servings} sourceSlot={sourceSlot} /> : null}
      </div>
    </section>
  )
}
