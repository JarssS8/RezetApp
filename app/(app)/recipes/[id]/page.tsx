import { notFound } from 'next/navigation'
import { RecipeDetailView, type SerializableDetail } from '@/components/recipes/recipe-detail'
import { requireHousehold } from '@/lib/auth/guards'
import { getRecipeCached } from '@/lib/cache/recipes'
import { IdSchema } from '@/lib/validation/common'
import { RecipeGetQuerySchema } from '@/lib/validation/recipes'

export default async function RecipeDetailPage({
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
  const rawServings = typeof sp.servings === 'string' ? sp.servings : undefined
  const parsedQuery = RecipeGetQuerySchema.safeParse({ servings: rawServings })
  const requestedServings = parsedQuery.success ? parsedQuery.data.servings : undefined

  // La vista recalcula su propio escalado en cliente (scaleRecipe con
  // servingsBase real); no hace falta pedirle a getRecipe que escale, así
  // que aquí no se pasan las raciones pedidas — solo se guardan para el
  // valor inicial del stepper.
  const detail = await getRecipeCached(ctx.householdId, ctx.locale, id)
  if (!detail) notFound()

  // JSON.parse(JSON.stringify(...)): getRecipe devuelve Date reales (createdAt,
  // updatedAt, lastCookedAt) que no cruzan la frontera servidor -> cliente sin
  // serializar; SerializableDetail tipa el resultado ya con esos campos en string.
  const serializable = JSON.parse(JSON.stringify(detail)) as SerializableDetail

  return (
    <RecipeDetailView
      detail={serializable}
      locale={ctx.locale}
      units={ctx.session.user.units}
      initialServings={requestedServings ?? detail.recipe.servingsBase}
    />
  )
}
