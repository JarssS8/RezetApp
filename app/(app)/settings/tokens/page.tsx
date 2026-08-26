import { getTranslations } from 'next-intl/server'
import { ApiTokensPanel } from '@/components/settings/api-tokens-panel'
import { createApiTokenAction, revokeApiTokenAction } from '@/lib/actions/settings'
import { requireHousehold } from '@/lib/auth/guards'
import { listApiTokens } from '@/lib/services/api-tokens'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const tokens = await listApiTokens(ctx)
  return (
    <div>
      <h2 className="text-lg">{t('sections.tokens')}</h2>
      <div className="mt-4">
        <ApiTokensPanel tokens={tokens} isOwner={ctx.role === 'owner'} createAction={createApiTokenAction} revokeAction={revokeApiTokenAction} />
      </div>
    </div>
  )
}
