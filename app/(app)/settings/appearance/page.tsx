import { getTranslations } from 'next-intl/server'
import { AppearanceForm, type AppearancePrefs } from '@/components/settings/appearance-form'
import { requireHousehold } from '@/lib/auth/guards'
import { updateUserPrefsAction } from '@/lib/actions/settings'
import { ACCENTS, DEFAULT_PREFS } from '@/lib/prefs'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const { user } = ctx.session
  const accent = (ACCENTS as readonly string[]).includes(user.accent) ? (user.accent as (typeof ACCENTS)[number]) : DEFAULT_PREFS.accent
  const initial: AppearancePrefs = {
    displayName: user.displayName,
    theme: user.theme,
    accent,
    locale: user.locale === 'en' ? 'en' : 'es',
    units: user.units,
  }
  return (
    <div>
      <h2 className="text-lg">{t('sections.appearance')}</h2>
      <div className="mt-4">
        <AppearanceForm initial={initial} updateAction={updateUserPrefsAction} />
      </div>
    </div>
  )
}
