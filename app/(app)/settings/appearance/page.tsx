import { getTranslations } from 'next-intl/server'

export default async function Page() {
  const t = await getTranslations('settings')
  const c = await getTranslations('common')
  return (
    <div>
      <h2 className="text-lg">{t('sections.appearance')}</h2>
      <p className="mt-1 text-text-2">{c('state.comingSoon')}</p>
    </div>
  )
}
