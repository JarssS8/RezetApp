import { getTranslations } from 'next-intl/server'
import { SettingsNav } from '@/components/settings/settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('settings')
  return (
    <main>
      <h1 className="text-2xl">{t('title')}</h1>
      <SettingsNav />
      <section className="mt-4">{children}</section>
    </main>
  )
}
