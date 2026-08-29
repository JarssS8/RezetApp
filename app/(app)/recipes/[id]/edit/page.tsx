import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChevronLeftIcon } from '@/components/icons'
import { RecipeEditor } from '@/components/recipes/recipe-editor'
import type { FoodWithNutrition } from '@/lib/actions/foods'
import { requireHousehold } from '@/lib/auth/guards'
import { detailToInput } from '@/lib/services/recipe-mapper'
import { getRecipe } from '@/lib/services/recipes'
import { IdSchema } from '@/lib/validation/common'

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!IdSchema.safeParse(id).success) notFound()

  const ctx = await requireHousehold()
  const tc = await getTranslations('common')
  const detail = await getRecipe(ctx, id)
  if (!detail) notFound()

  const initial = detailToInput(detail)
  // RecipeInput/detailToInput no llevan el nombre del alimento
  // (RecipeIngredientInputSchema es estricto, sin ese campo): se saca aparte
  // de detail.ingredients[].food, que getRecipe siempre resuelve a
  // FoodWithNutrition (con nameEs/nameEn) aunque IngredientWithFood lo tipe
  // como el FoodNutrition mínimo que exige el dominio (mismo cast
  // estructural que ingredient-list.tsx). Así IngredientLineEditor muestra
  // el nombre real en vez de la conjetura de parseIngredientLine.
  const initialFoodNames = detail.ingredients.map((i) => {
    const food = i.food as FoodWithNutrition | null
    return food ? (ctx.locale === 'en' ? food.nameEn : food.nameEs) : null
  })

  return (
    <main className="view-enter pb-6">
      <Link href={`/recipes/${id}`} aria-label={tc('actions.back')} className="inline-flex min-h-11 min-w-11 items-center justify-center">
        <ChevronLeftIcon />
      </Link>
      <RecipeEditor initial={initial} initialFoodNames={initialFoodNames} recipeId={id} locale={ctx.locale} />
    </main>
  )
}
