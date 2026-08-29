'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronLeftIcon, CookIcon, EditIcon, PlanIcon, TrashIcon } from '@/components/icons'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { deleteRecipeAction, type RecipeDetail } from '@/lib/actions/recipes'
import { aggregateNutrition, scaleRecipe, timerMinutes } from '@/lib/domain'
import type { Locale, UnitSystem } from '@/lib/domain/types'
import { cn } from '@/lib/utils'
import { buildIngredientRows, IngredientList, type DetailIngredient } from './ingredient-list'
import { NutritionRow } from './nutrition-row'
import { RecipePlaceholder } from './recipe-placeholder'
import { ServingsStepper } from './servings-stepper'

type SerializableRecipe = Omit<RecipeDetail['recipe'], 'createdAt' | 'updatedAt' | 'lastCookedAt' | 'deletedAt'> & {
  createdAt: string
  updatedAt: string
  lastCookedAt: string | null
  deletedAt: string | null
}

// RecipeDetail tal como sale de getRecipe, con los Date convertidos a string
// (JSON.parse(JSON.stringify(...)) en la página) y el alimento de cada
// ingrediente ya tipado como FoodWithNutrition (ver ingredient-list.tsx).
export type SerializableDetail = Omit<RecipeDetail, 'recipe' | 'ingredients'> & {
  recipe: SerializableRecipe
  ingredients: DetailIngredient[]
}

export interface RecipeDetailViewProps {
  detail: SerializableDetail
  locale: Locale
  units: UnitSystem
  // Raciones iniciales del stepper (de ?servings= en la página); por defecto
  // las de la receta.
  initialServings?: number
}

export function RecipeDetailView({ detail, locale, units, initialServings }: RecipeDetailViewProps) {
  const t = useTranslations('recipes')
  const tc = useTranslations('common')
  const router = useRouter()

  const [servings, setServings] = useState(initialServings ?? detail.recipe.servingsBase)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const scaled = useMemo(
    () => scaleRecipe({ servingsBase: detail.recipe.servingsBase, ingredients: detail.ingredients }, servings),
    [detail, servings],
  )

  // Nutrición ya calculada por el servicio (mismas entradas: ingredientes base
  // + servingsBase + yieldGrams) — no se recalcula aquí, solo se lee.
  const nutrition = detail.nutrition

  const rows = useMemo(() => buildIngredientRows(scaled, detail.ingredients, locale, units), [scaled, detail.ingredients, locale, units])

  // Las kcal por ración no cambian al escalar (docs/03-DOMINIO §2); lo que
  // cambia es el total. aggregateNutrition hace la multiplicación en el
  // dominio (nunca a mano en el componente): un único "plan" de una entrada
  // con las raciones actuales reutiliza exactamente la misma función que
  // suma varias entradas del plan de comidas.
  const totalKcal = nutrition ? aggregateNutrition([{ nutrition, servings }]).total.kcal : null
  const imageUrl = detail.recipe.imageUrls[0] ?? null

  async function handleDelete() {
    setDeleting(true)
    try {
      const result = await deleteRecipeAction(detail.recipe.id)
      if (!result.ok) {
        toast.error(t('detail.deleteError'))
        return
      }
      router.push('/recipes')
    } finally {
      setDeleting(false)
    }
  }

  // Auditoría W7, hallazgo 7.2: recipes/[id] era una de las 13 rutas sin view-enter.
  return (
    <main className="view-enter pb-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/recipes" aria-label={tc('actions.back')} className="inline-flex min-h-11 min-w-11 items-center justify-center">
          <ChevronLeftIcon />
        </Link>
        {/* Auditoría W7, hallazgo 2.1: 4px entre objetivos táctiles de 44px. */}
        <div className="flex gap-2">
          <Link
            href={`/recipes/${detail.recipe.id}/edit`}
            aria-label={t('detail.edit')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center"
          >
            <EditIcon />
          </Link>
          <Button type="button" variant="ghost" size="icon" aria-label={t('detail.delete')} onClick={() => setConfirmOpen(true)}>
            <TrashIcon />
          </Button>
        </div>
      </div>

      {imageUrl ? (
        // Servida desde el volumen local (mismo origen): sin next/image, igual que recipe-card.tsx.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mt-2 aspect-video w-full rounded-lg object-cover" />
      ) : (
        <RecipePlaceholder recipeId={detail.recipe.id} className="mt-2 rounded-lg" />
      )}

      <h1 className="mt-3 title-content">{detail.recipe.title}</h1>
      {detail.recipe.description ? <p className="mt-1 text-sm text-text-2">{detail.recipe.description}</p> : null}
      <p className="tabular mt-1 text-xs text-text-2">{t('detail.cooked', { count: detail.recipe.timesCooked })}</p>

      {detail.tags.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {detail.tags.map((tag) => (
            <li key={tag.id} className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2">
              {tag.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-2">{t('detail.servings')}</span>
        <ServingsStepper value={servings} onChange={setServings} />
      </div>

      {nutrition ? (
        <div className="mt-3">
          <NutritionRow
            perServingKcal={nutrition.perServing.kcal}
            totalKcal={totalKcal ?? 0}
            per100gKcal={nutrition.per100g?.kcal ?? null}
            isEstimated={nutrition.isEstimated}
          />
        </div>
      ) : null}

      <section className="mt-6 rounded-lg border border-line-2 bg-card p-4 shadow-card">
        <h2 className="font-display text-lg">{t('detail.ingredients')}</h2>
        <div className="mt-2">
          <IngredientList rows={rows} />
        </div>
      </section>

      {detail.steps.length > 0 ? (
        <section className="mt-6 rounded-lg border border-line-2 bg-card p-4 shadow-card">
          <h2 className="font-display text-lg">{t('detail.steps')}</h2>
          <ol className="mt-2 flex flex-col gap-3">
            {detail.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3">
                <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-acc-soft text-xs font-semibold text-acc-ink">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm">{step.text}</p>
                  {step.timerSeconds ? (
                    <span className="tabular text-xs text-text-2">{t('detail.timer', { minutes: timerMinutes(step.timerSeconds) })}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {detail.recipe.notes ? (
        <section className="mt-6 rounded-lg border border-line-2 bg-card p-4 shadow-card">
          <h2 className="font-display text-lg">{t('detail.notes')}</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-text-2">{detail.recipe.notes}</p>
        </section>
      ) : null}

      <div className="mt-6 flex gap-2">
        <Link href={`/cook/recipe/${detail.recipe.id}?servings=${servings}`} className={cn(buttonVariants({ variant: 'default' }), 'flex-1')}>
          <CookIcon size={18} />
          {t('detail.cook')}
        </Link>
        <Link href={`/plan?add=${detail.recipe.id}&servings=${servings}`} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
          <PlanIcon size={18} />
          {t('detail.addToPlan')}
        </Link>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t('detail.delete')}</DialogTitle>
          <p className="text-sm text-text-2">{t('detail.deleteConfirm', { title: detail.recipe.title })}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="button" variant="destructive" aria-busy={deleting} disabled={deleting} onClick={() => void handleDelete()}>
              {tc('actions.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
