import { getLocale, getTranslations } from 'next-intl/server'
import { ShoplistSettingsForm } from '@/components/settings/shoplist-settings-form'
import { getShopListLinkAction } from '@/lib/actions/shopping'
import { requireHousehold } from '@/lib/auth/guards'
import { getShoplistSettings } from '@/lib/services/shoplist-settings'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const [settings, linkResult] = await Promise.all([getShoplistSettings(ctx), getShopListLinkAction()])

  // La fecha de último envío se formatea aquí, en el Server Component, con
  // Intl.DateTimeFormat(locale) y se pasa ya lista como texto.
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  const lastPushed = settings.lastPushedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(settings.lastPushedAt)) : null
  const deepLink = linkResult.ok ? linkResult.data.deepLink : null

  return (
    <div className="view-enter">
      <h2 className="text-lg">{t('sections.shoplist')}</h2>
      <div className="mt-4 max-w-md">
        <ShoplistSettingsForm
          fnUrl={settings.fnUrl}
          hasSecret={settings.hasSecret}
          listToken={settings.listToken}
          source={settings.source}
          lastPushed={lastPushed}
          deepLink={deepLink}
          readOnly={ctx.role !== 'owner'}
        />
      </div>
    </div>
  )
}
