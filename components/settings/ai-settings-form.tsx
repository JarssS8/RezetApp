'use client'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import type { z } from 'zod'
import { testAiConnectionAction, updateAiSettingsAction } from '@/lib/actions/ai'
import { actionErrorKey } from '@/lib/actions/result'
import type { AiSettingsSchema } from '@/lib/validation/household'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'

type AiSettings = z.infer<typeof AiSettingsSchema>
type Provider = AiSettings['provider']

const PROVIDERS: readonly Provider[] = ['none', 'anthropic', 'openai', 'openai_compatible']

// Catálogo de modelos con precio conocido (lib/ai/models.ts): solo provider+id,
// nada de precios ni de PII. La página (app/(app)/settings/ai/page.tsx, la
// única capa de esta pantalla con permiso de boundaries para leer lib/ai) lo
// calcula y lo pasa aquí para que el formulario decida en vivo -mientras el
// usuario escribe, sin guardar- si el modelo elegido tiene precio de catálogo
// o hay que pedirle el suyo (párrafo `modelHint` + los dos campos de precio).
export interface KnownAiModel {
  provider: Provider
  id: string
}

export interface AiSettingsFormProps {
  provider: Provider
  model: string | null
  baseUrl: string | null
  hasKey: boolean
  monthlyCapCents: number
  structuredOutput: boolean
  spentThisMonthCents: number
  knownModels: KnownAiModel[]
  priceInCentsPerMtok?: number | null
  priceOutCentsPerMtok?: number | null
  /** true para miembros que no son propietarios: solo lectura. */
  readOnly: boolean
}

interface TestState {
  ok: boolean
  message: string
}

// '' o no numérico -> null (sin precio propio); si no, céntimos por millón de
// tokens redondeados a entero (nunca negativos: el input ya tiene min={0}).
function parsePriceCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export function AiSettingsForm(props: AiSettingsFormProps) {
  const t = useTranslations('settings.ai')
  const c = useTranslations('common')
  const te = useTranslations('errors')
  const format = useFormatter()

  const [provider, setProvider] = useState<Provider>(props.provider)
  const [model, setModel] = useState(props.model ?? '')
  const [baseUrl, setBaseUrl] = useState(props.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(props.hasKey)
  const [capEuros, setCapEuros] = useState(String(props.monthlyCapCents / 100))
  const [structuredOutput, setStructuredOutput] = useState(props.structuredOutput)
  const [spentThisMonthCents, setSpentThisMonthCents] = useState(props.spentThisMonthCents)
  const [priceIn, setPriceIn] = useState(props.priceInCentsPerMtok != null ? String(props.priceInCentsPerMtok) : '')
  const [priceOut, setPriceOut] = useState(props.priceOutCentsPerMtok != null ? String(props.priceOutCentsPerMtok) : '')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestState | null>(null)

  const spentAmount = format.number(spentThisMonthCents / 100, { style: 'currency', currency: 'EUR' })

  const trimmedModel = model.trim()
  // Regla I1/4: sin modelo de catálogo (anthropic siempre, o un id que el
  // hogar escribió a mano en openai/openai_compatible) `resolvePrices` no
  // tiene de dónde sacar el precio -el gasto se contabilizaría como 0 y el
  // tope nunca saltaría-, así que aquí se le pide el suyo.
  const knownModel = trimmedModel !== '' && props.knownModels.some((m) => m.provider === provider && m.id === trimmedModel)

  if (props.readOnly) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-text-2">{t('ownerOnly')}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-text-2">{t('provider')}</dt>
          <dd>{t(`providers.${props.provider}`)}</dd>
          <dt className="text-text-2">{t('cap')}</dt>
          <dd>{format.number(props.monthlyCapCents / 100, { style: 'currency', currency: 'EUR' })}</dd>
        </dl>
        <p className="text-sm text-text-2">{t('spent', { amount: spentAmount })}</p>
      </div>
    )
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAiConnectionAction()
      if (!result.ok) {
        // I3/14/24: `result.message` es texto crudo de ServiceError/zod, nunca
        // se pinta tal cual; se traduce por `result.code` como en `handleSave`.
        setTestResult({ ok: false, message: te(actionErrorKey(result.code)) })
        return
      }
      setTestResult(
        result.data.ok
          ? { ok: true, message: t('testOk', { ms: result.data.latencyMs }) }
          : { ok: false, message: t('testFail', { message: result.data.message }) },
      )
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      const payload: AiSettings = {
        provider,
        model: model.trim() === '' ? null : model.trim(),
        baseUrl: provider === 'openai_compatible' ? (baseUrl.trim() === '' ? null : baseUrl.trim()) : null,
        apiKey,
        monthlyCapCents: Math.round(Number(capEuros || 0) * 100),
        structuredOutput,
        // Sin modelo de catálogo se mandan siempre las dos claves (null borra
        // el precio propio guardado si el campo se deja vacío); con modelo de
        // catálogo se omiten del todo (el precio lo da el catálogo, no el hogar).
        ...(!knownModel && {
          priceInCentsPerMtok: parsePriceCents(priceIn),
          priceOutCentsPerMtok: parsePriceCents(priceOut),
        }),
      }
      const result = await updateAiSettingsAction(payload)
      if (!result.ok) {
        setSaveError(te(actionErrorKey(result.code)))
        return
      }
      setHasKey(result.data.hasKey)
      setSpentThisMonthCents(result.data.spentThisMonthCents)
      setApiKey('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4" data-testid="ai-settings-form">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-provider">{t('provider')}</Label>
        <NativeSelect id="ai-provider" value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="w-full">
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t(`providers.${p}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-model">{t('model')}</Label>
        <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} maxLength={80} />
      </div>

      {provider === 'openai_compatible' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-base-url">{t('baseUrl')}</Label>
          <Input id="ai-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={t('baseUrlPlaceholder')} />
          <p className="text-sm text-text-2">{t('localHint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-api-key">{t('apiKey')}</Label>
        <Input
          id="ai-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasKey ? t('keySaved') : undefined}
          maxLength={200}
          autoComplete="off"
        />
      </div>

      {!knownModel && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-2">{t('modelHint')}</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-price-in">{t('priceIn')}</Label>
              <Input id="ai-price-in" type="number" min={0} step="1" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} className="w-28" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-price-out">{t('priceOut')}</Label>
              <Input id="ai-price-out" type="number" min={0} step="1" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} className="w-28" />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-cap">{t('cap')}</Label>
        <Input id="ai-cap" type="number" min={0} step="0.01" value={capEuros} onChange={(e) => setCapEuros(e.target.value)} />
        <p className="text-sm text-text-2">{t('spent', { amount: spentAmount })}</p>
      </div>

      <Label htmlFor="ai-structured" className="justify-between">
        {t('structured')}
        <Switch id="ai-structured" checked={structuredOutput} onCheckedChange={setStructuredOutput} />
      </Label>

      {saveError && (
        <p role="alert" className="text-sm text-warn">
          {saveError}
        </p>
      )}
      {testResult && (
        <p role="status" className={testResult.ok ? 'text-sm text-text-2' : 'text-sm text-warn'}>
          {testResult.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing} aria-busy={testing}>
          {testing ? c('state.working') : t('test')}
        </Button>
        <Button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? c('state.working') : c('actions.save')}
        </Button>
      </div>
    </form>
  )
}
