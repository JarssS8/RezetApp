import { notFound } from 'next/navigation'
import { CookSession } from '@/components/cook/cook-session'
import { toSerializableRecipe } from '@/components/cook/serialize'
import { requireHousehold } from '@/lib/auth/guards'
import { getPlanEntry } from '@/lib/cache/plan'
import { getRecipeCached } from '@/lib/cache/recipes'
import { IdSchema } from '@/lib/validation/common'

export default async function CookEntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params
  if (!IdSchema.safeParse(entryId).success) notFound()
  const ctx = await requireHousehold()
  const entry = await getPlanEntry(ctx.householdId, ctx.locale, entryId)
  // Sin receta (comida libre) o sobra (la despensa ya se descontó el día que
  // se cocinó, docs/03-DOMINIO): no son cocinables desde aquí.
  if (!entry || !entry.recipeId || entry.leftoverOfEntryId) notFound()
  const detail = await getRecipeCached(ctx.householdId, ctx.locale, entry.recipeId)
  if (!detail) notFound()
  const serializable = toSerializableRecipe(detail)
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
      sourceSlot={entry.slot}
    />
  )
}
