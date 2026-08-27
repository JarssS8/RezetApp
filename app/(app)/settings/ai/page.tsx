import { getTranslations } from 'next-intl/server'
import { AiSettingsForm, type KnownAiModel } from '@/components/settings/ai-settings-form'
import { requireHousehold } from '@/lib/auth/guards'
import { MODELS } from '@/lib/ai/models'
import { getAiSettings } from '@/lib/services/ai-settings'

// Solo provider+id del catálogo (lib/ai/models.ts, puro, sin proveedor ni
// DB): el formulario de ajustes (componente cliente) no puede importar
// lib/ai directamente (frontera de eslint-boundaries), así que esta página
// -que sí puede, igual que ya hace lib/services- se lo pasa como datos.
const KNOWN_MODELS: KnownAiModel[] = MODELS.map((m) => ({ provider: m.provider, id: m.id }))

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
          knownModels={KNOWN_MODELS}
          priceInCentsPerMtok={settings.priceInCentsPerMtok}
          priceOutCentsPerMtok={settings.priceOutCentsPerMtok}
          readOnly={ctx.role !== 'owner'}
        />
      </div>
    </div>
  )
}
