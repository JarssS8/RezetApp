'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { z } from 'zod'
import { LinkIcon } from '@/components/icons'
import { updateShoplistSettingsAction } from '@/lib/actions/shopping'
import { actionErrorKey } from '@/lib/actions/result'
import type { ShoplistSettingsSchema } from '@/lib/validation/household'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type ShoplistSettings = z.infer<typeof ShoplistSettingsSchema>
type Source = 'household' | 'env' | 'none'

export interface ShoplistSettingsFormProps {
  fnUrl: string | null
  hasSecret: boolean
  listToken: string | null
  source: Source
  /** Ya formateado con Intl.DateTimeFormat(locale) en la página (server). */
  lastPushed: string | null
  /** Enlace "Abrir en ShopList" calculado en la página: los componentes no importan lib/integrations. */
  deepLink: string | null
  /** true para miembros que no son propietarios: solo lectura. */
  readOnly: boolean
}

function OpenListLink({ deepLink, t }: { deepLink: string; t: ReturnType<typeof useTranslations> }) {
  return (
    <a href={deepLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary">
      <LinkIcon size={16} />
      {t('open')}
    </a>
  )
}

export function ShoplistSettingsForm(props: ShoplistSettingsFormProps) {
  const t = useTranslations('settings.shoplist')
  const c = useTranslations('common')
  const te = useTranslations('errors')

  const [fnUrl, setFnUrl] = useState(props.fnUrl ?? '')
  const [secret, setSecret] = useState('')
  const [clearSecret, setClearSecret] = useState(false)
  const [hasSecret, setHasSecret] = useState(props.hasSecret)
  const [listToken, setListToken] = useState(props.listToken ?? '')
  const [source, setSource] = useState<Source>(props.source)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (props.readOnly) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-text-2">{t('ownerOnly')}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-text-2">{t('status')}</dt>
          <dd>{t(`source.${props.source}`)}</dd>
        </dl>
        {props.lastPushed ? <p className="text-sm text-text-2">{t('lastPushed', { date: props.lastPushed })}</p> : null}
        {props.deepLink ? <OpenListLink deepLink={props.deepLink} t={t} /> : null}
      </div>
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      const payload: ShoplistSettings = {
        fnUrl: fnUrl.trim() === '' ? null : fnUrl.trim(),
        secret: clearSecret ? null : secret,
        listToken: listToken.trim() === '' ? null : listToken.trim(),
      }
      const result = await updateShoplistSettingsAction(payload)
      if (!result.ok) {
        setSaveError(te(actionErrorKey(result.code)))
        return
      }
      setHasSecret(result.data.hasSecret)
      setSource(result.data.source)
      setSecret('')
      setClearSecret(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4" data-testid="shoplist-settings-form">
      <p className="text-sm text-text-2">{t('hint')}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shoplist-fn-url">{t('fnUrl')}</Label>
        <Input id="shoplist-fn-url" value={fnUrl} onChange={(e) => setFnUrl(e.target.value)} placeholder="https://…" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shoplist-secret">{t('secret')}</Label>
        <Input
          id="shoplist-secret"
          type="password"
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value)
            setClearSecret(false)
          }}
          placeholder={hasSecret ? t('secretSaved') : undefined}
          maxLength={200}
          autoComplete="off"
          disabled={clearSecret}
        />
        {hasSecret ? (
          <Label htmlFor="shoplist-secret-clear" className="justify-between">
            {t('secretClear')}
            <Switch id="shoplist-secret-clear" checked={clearSecret} onCheckedChange={setClearSecret} />
          </Label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shoplist-list-token">{t('listToken')}</Label>
        <Input id="shoplist-list-token" value={listToken} onChange={(e) => setListToken(e.target.value)} maxLength={120} />
      </div>

      <p className="text-sm text-text-2">
        {t('status')}: {t(`source.${source}`)}
      </p>
      {props.lastPushed ? <p className="text-sm text-text-2">{t('lastPushed', { date: props.lastPushed })}</p> : null}
      {props.deepLink ? <OpenListLink deepLink={props.deepLink} t={t} /> : null}

      {saveError && (
        <p role="alert" className="text-sm text-danger-ink">
          {saveError}
        </p>
      )}

      <Button type="submit" disabled={saving} aria-busy={saving}>
        {saving ? c('state.working') : c('actions.save')}
      </Button>
    </form>
  )
}
