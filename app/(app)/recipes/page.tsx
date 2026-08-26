import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SettingsIcon } from '@/components/icons'

export default async function RecipesPage() {
  const t = await getTranslations('recipes')
  const c = await getTranslations('common')
  return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">{t('title')}</h1>
        <Link href="/settings" aria-label={c('settings')}>
          <SettingsIcon />
        </Link>
      </div>
      <p className="mt-2 text-text-2">{c('state.comingSoon')}</p>
    </main>
  )
}
