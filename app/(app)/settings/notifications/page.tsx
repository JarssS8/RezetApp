import { getTranslations } from 'next-intl/server'
import { NotificationsPanel } from '@/components/settings/notifications-panel'
import { requireHousehold } from '@/lib/auth/guards'
import { listPushSubscriptions } from '@/lib/services/push'

export default async function Page() {
  const ctx = await requireHousehold()
  const t = await getTranslations('settings')
  const subs = ctx.userId ? await listPushSubscriptions(ctx.db, ctx.userId) : []
  return (
    <div>
      <h2 className="text-lg">{t('sections.notifications')}</h2>
      <p className="mt-1 text-text-2">{t('notifications.hint')}</p>
      <div className="mt-3">
        <NotificationsPanel subscribedEndpoints={subs.map((s) => s.endpoint)} />
      </div>
      <p className="mt-4 text-sm text-text-2">{t('notifications.cron')}</p>
    </div>
  )
}
