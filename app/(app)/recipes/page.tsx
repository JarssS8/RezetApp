import { getTranslations } from 'next-intl/server'

export default async function RecipesPage() {
  const t = await getTranslations('recipes')
  const c = await getTranslations('common')
  return (
    <main>
      <h1 className="text-2xl">{t('title')}</h1>
      <p className="mt-2 text-text-2">{c('state.comingSoon')}</p>
    </main>
  )
}
