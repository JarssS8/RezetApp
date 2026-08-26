import { getTranslations } from 'next-intl/server'

export default async function LoginPage() {
  const t = await getTranslations('auth')
  return (
    <main>
      <h1 className="text-2xl">{t('title')}</h1>
    </main>
  )
}
