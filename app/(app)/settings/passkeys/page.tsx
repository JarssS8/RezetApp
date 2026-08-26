import { getTranslations } from 'next-intl/server'
import { AddPasskeyButton } from '@/components/settings/add-passkey-button'
import { PasskeysPanel } from '@/components/settings/passkeys-panel'
import { renamePasskeyAction, removePasskeyAction } from '@/lib/actions/settings'
import { requireHousehold } from '@/lib/auth/guards'
import { listPasskeys } from '@/lib/services/passkeys'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const passkeys = await listPasskeys(ctx)
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg">{t('sections.passkeys')}</h2>
      <AddPasskeyButton />
      <PasskeysPanel passkeys={passkeys} renameAction={renamePasskeyAction} removeAction={removePasskeyAction} />
    </div>
  )
}
