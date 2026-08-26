import { getTranslations } from 'next-intl/server'

export default async function RegisterPage() {
  const t = await getTranslations('auth')
  return (
    <main>
      <h1 className="text-2xl">{t('registerTitle')}</h1>
    </main>
  )
}
