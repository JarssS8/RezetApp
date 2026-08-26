import { getTranslations } from 'next-intl/server'
import { AiSettingsForm } from '@/components/settings/ai-settings-form'
import { requireHousehold } from '@/lib/auth/guards'
import { getAiSettings } from '@/lib/services/ai-settings'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const settings = await getAiSettings(ctx)
  return (
    <div>
      <h2 className="text-lg">{t('sections.ai')}</h2>
      <div className="mt-4 max-w-md">
        <AiSettingsForm
          provider={settings.provider}
          model={settings.model}
          baseUrl={settings.baseUrl}
          hasKey={settings.hasKey}
          monthlyCapCents={settings.monthlyCapCents}
          structuredOutput={settings.structuredOutput}
          spentThisMonthCents={settings.spentThisMonthCents}
          readOnly={ctx.role !== 'owner'}
        />
      </div>
    </div>
  )
}
