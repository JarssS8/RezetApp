import { notFound } from 'next/navigation'
import { CookSession } from '@/components/cook/cook-session'
import type { DetailIngredient } from '@/components/recipes/ingredient-list'
import { requireHousehold } from '@/lib/auth/guards'
import { slotForHour } from '@/lib/domain'
import { getRecipe } from '@/lib/services/recipes'
import { IdSchema } from '@/lib/validation/common'
import { RecipeGetQuerySchema } from '@/lib/validation/recipes'

// Hora local del hogar para deducir el hueco por defecto de las sobras
// (§9.5, paso 1): mismo criterio que lib/services/cooking.ts::hourInHouseholdTz
// (los hogares aún no tienen zona horaria propia).
function currentSlot(now = new Date(), tz = 'Europe/Madrid') {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
  return slotForHour(hour)
}

// Cocinar sin hueco en el plan: las raciones vienen de ?servings= (enlace del
// detalle de receta) o, si no, de las raciones por defecto del hogar.
export default async function CookRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  if (!IdSchema.safeParse(id).success) notFound()
  const ctx = await requireHousehold()
  const sp = await searchParams
  const raw = typeof sp.servings === 'string' ? sp.servings : undefined
  const parsed = RecipeGetQuerySchema.safeParse({ servings: raw })
  const detail = await getRecipe(ctx, id)
  if (!detail) notFound()
  const serializable = JSON.parse(JSON.stringify(detail)) as { ingredients: DetailIngredient[]; steps: { id: string; index: number; text: string; timerSeconds: number | null; imageUrl: string | null }[] }
  return (
    <CookSession
      recipeId={detail.recipe.id}
      entryId={null}
      title={detail.recipe.title}
      servingsBase={detail.recipe.servingsBase}
      initialServings={(parsed.success ? parsed.data.servings : undefined) ?? ctx.session.household.defaultServings}
      ingredients={serializable.ingredients}
      steps={serializable.steps}
      locale={ctx.locale}
      units={ctx.session.user.units}
      sourceSlot={currentSlot()}
    />
  )
}
