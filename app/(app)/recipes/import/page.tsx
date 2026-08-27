import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronLeftIcon } from '@/components/icons'
import { ImportForm } from '@/components/recipes/import-form'
import { requireHousehold } from '@/lib/auth/guards'

export default async function ImportRecipePage() {
  await requireHousehold()
  const t = await getTranslations('recipes')
  const c = await getTranslations('common')

  return (
    <main className="pb-6">
      <Link href="/recipes" aria-label={c('actions.back')} className="inline-flex min-h-11 min-w-11 items-center justify-center">
        <ChevronLeftIcon />
      </Link>
      <h1 className="mt-2 font-display text-2xl">{t('import.title')}</h1>
      <div className="mt-4">
        <ImportForm />
      </div>
    </main>
  )
}
