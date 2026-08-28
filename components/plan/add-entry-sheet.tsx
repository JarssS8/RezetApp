'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { SearchIcon } from '@/components/icons'
import { ServingsStepper } from '@/components/recipes/servings-stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { applyPlanBatchAction, searchRecipesForPlanAction } from '@/lib/actions/plan'
import { MEAL_SLOTS } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { MealSlot } from '@/lib/validation/plan'

export interface AddEntrySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: string[]
  defaultDate: string
  defaultSlot: MealSlot
  // Receta preseleccionada al abrir vía ?add=<recipeId>&servings=N (enlace
  // desde el detalle de receta de (a)); null cuando se abre desde el "+" de un hueco.
  initialRecipeId: string | null
  initialServings: number
  onAdded: () => void
}

interface RecipeOption {
  id: string
  title: string
}

const SEARCH_DEBOUNCE_MS = 250

// Hoja para añadir una comida al plan: buscar receta o título libre, con
// fecha/hueco/raciones editables. Ver lib/actions/plan.ts::searchRecipesForPlanAction.
//
// El formulario no se reinicia con un efecto: la instancia entera se
// remonta con una `key` distinta cada vez que WeekView abre la hoja (ver
// week-view.tsx::sheetSeq), así que los useState de aquí abajo ya arrancan
// con los valores correctos de cada apertura.
export function AddEntrySheet({ open, onOpenChange, days, defaultDate, defaultSlot, initialRecipeId, initialServings, onAdded }: AddEntrySheetProps) {
  const t = useTranslations('plan')
  const c = useTranslations('common')
  const [date, setDate] = useState(defaultDate)
  const [slot, setSlot] = useState<MealSlot>(defaultSlot)
  const [servings, setServings] = useState(initialServings)
  const [mode, setMode] = useState<'recipe' | 'free'>('recipe')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipeOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialRecipeId)
  const [customTitle, setCustomTitle] = useState('')
  const [pending, setPending] = useState(false)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!open || mode !== 'recipe' || query.trim().length === 0) return
    const seq = ++requestSeq.current
    const timer = setTimeout(() => {
      void searchRecipesForPlanAction(query).then((res) => {
        if (requestSeq.current !== seq) return // respuesta obsoleta: ya se lanzó otra búsqueda
        if (res.ok) setResults(res.data)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, mode, open])

  // Resultados a mostrar: si la búsqueda ya no aplica (campo vacío, modo
  // libre) no hace falta limpiar `results` con un efecto, basta con no
  // mostrarlos.
  const visibleResults = useMemo(() => (mode === 'recipe' && query.trim().length > 0 ? results : []), [mode, query, results])

  const canSubmit = mode === 'recipe' ? selectedId !== null : customTitle.trim().length > 0

  async function submit() {
    if (!canSubmit) return
    setPending(true)
    const item =
      mode === 'recipe' && selectedId !== null
        ? { date, slot, recipeId: selectedId, servings }
        : { date, slot, customTitle: customTitle.trim(), servings }
    const result = await applyPlanBatchAction({ add: [item], remove: [] })
    setPending(false)
    if (!result.ok) {
      toast.error(t('errors.addEntry'))
      return
    }
    onAdded()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t('addTo', { slot: t(`slots.${slot}`) })}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-2">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="add-entry-date">{t('moveDate')}</Label>
              <NativeSelect id="add-entry-date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full">
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="add-entry-slot">{t('moveSlot')}</Label>
              <NativeSelect id="add-entry-slot" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)} className="w-full">
                {MEAL_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`slots.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant={mode === 'recipe' ? 'default' : 'outline'} size="sm" onClick={() => setMode('recipe')}>
              {t('searchRecipe')}
            </Button>
            <Button type="button" variant={mode === 'free' ? 'default' : 'outline'} size="sm" onClick={() => setMode('free')}>
              {t('freeMeal')}
            </Button>
          </div>

          {mode === 'recipe' ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-2" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelectedId(null)
                  }}
                  placeholder={t('searchRecipe')}
                  className="pl-8"
                />
              </div>
              <ul className="flex flex-col gap-1">
                {visibleResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        'min-h-11 w-full rounded-sm border px-2.5 text-left text-sm',
                        selectedId === r.id ? 'border-primary bg-accent' : 'border-border bg-card',
                      )}
                    >
                      {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-entry-free-title">{t('freeMealTitle')}</Label>
              <Input id="add-entry-free-title" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm">{t('servings')}</span>
            <ServingsStepper value={servings} onChange={setServings} />
          </div>
        </div>
        <SheetFooter>
          <Button type="button" disabled={!canSubmit || pending} onClick={() => void submit()}>
            {c('actions.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
