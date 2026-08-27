import { notFound } from 'next/navigation'
import { CookSession } from '@/components/cook/cook-session'
import type { DetailIngredient } from '@/components/recipes/ingredient-list'
import { requireHousehold } from '@/lib/auth/guards'
import { getEntry } from '@/lib/services/plan'
import { getRecipe } from '@/lib/services/recipes'
import { IdSchema } from '@/lib/validation/common'

export default async function CookEntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params
  if (!IdSchema.safeParse(entryId).success) notFound()
  const ctx = await requireHousehold()
  const entry = await getEntry(ctx, entryId)
  // Sin receta (comida libre) o sobra (la despensa ya se descontó el día que
  // se cocinó, docs/03-DOMINIO): no son cocinables desde aquí.
  if (!entry || !entry.recipeId || entry.leftoverOfEntryId) notFound()
  const detail = await getRecipe(ctx, entry.recipeId)
  if (!detail) notFound()
  // getRecipe devuelve Date reales que no cruzan la frontera servidor -> cliente.
  const serializable = JSON.parse(JSON.stringify(detail)) as { ingredients: DetailIngredient[]; steps: { id: string; index: number; text: string; timerSeconds: number | null; imageUrl: string | null }[] }
  return (
    <CookSession
      recipeId={entry.recipeId}
      entryId={entry.id}
      title={detail.recipe.title}
      servingsBase={detail.recipe.servingsBase}
      initialServings={entry.servings}
      ingredients={serializable.ingredients}
      steps={serializable.steps}
      locale={ctx.locale}
      units={ctx.session.user.units}
    />
  )
}
