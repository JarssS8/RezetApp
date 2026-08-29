import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronLeftIcon } from '@/components/icons'
import { RecipeEditor } from '@/components/recipes/recipe-editor'
import { requireHousehold } from '@/lib/auth/guards'

export default async function NewRecipePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireHousehold()
  const tc = await getTranslations('common')
  const sp = await searchParams
  // ?draft=1: el editor lee sessionStorage['rz.recipeDraft'] (lo deja la
  // Tarea 12, importar por foto/URL) en vez de arrancar en blanco.
  const useDraft = sp.draft === '1'

  return (
    <main className="view-enter pb-6">
      <Link href="/recipes" aria-label={tc('actions.back')} className="inline-flex min-h-11 min-w-11 items-center justify-center">
        <ChevronLeftIcon />
      </Link>
      <RecipeEditor locale={ctx.locale} useDraft={useDraft} />
    </main>
  )
}
