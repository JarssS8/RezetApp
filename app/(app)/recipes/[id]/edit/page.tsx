import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChevronLeftIcon } from '@/components/icons'
import { RecipeEditor } from '@/components/recipes/recipe-editor'
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

  return (
    <main className="pb-6">
      <Link href={`/recipes/${id}`} aria-label={tc('actions.back')} className="inline-flex min-h-11 min-w-11 items-center justify-center">
        <ChevronLeftIcon />
      </Link>
      <RecipeEditor initial={initial} recipeId={id} locale={ctx.locale} />
    </main>
  )
}
