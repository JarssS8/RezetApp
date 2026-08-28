import { getTranslations } from 'next-intl/server'
import { LogoutButton } from '@/components/settings/logout-button'
import { SettingsNav } from '@/components/settings/settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('settings')
  return (
    <main>
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-screen">{t('title')}</h1>
        <LogoutButton />
      </div>
      <SettingsNav />
      <section className="mt-4">{children}</section>
    </main>
  )
}
