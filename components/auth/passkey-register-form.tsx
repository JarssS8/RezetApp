'use client'
import { startRegistration } from '@simplewebauthn/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasskeyRegisterForm({ inviteToken, locale }: { inviteToken?: string; locale: 'es' | 'en' }) {
  const t = useTranslations('auth')
  const c = useTranslations('common')
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const opt = await fetch('/api/auth/register/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, inviteToken }),
      })
      if (!opt.ok) throw new Error('options')
      const { challengeId, options } = (await opt.json()) as { challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }
      const response = await startRegistration({ optionsJSON: options })
      const ver = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, displayName, inviteToken, locale, response }),
      })
      const data = (await ver.json()) as { ok?: boolean; redirect?: string }
      if (!ver.ok || !data.redirect) throw new Error('verify')
      router.push(data.redirect)
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setError(name === 'NotAllowedError' ? t('errors.cancelled') : name === 'NotSupportedError' ? t('errors.unsupported') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="register-form">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">{t('register.name')}</Label>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('register.namePlaceholder')}
          required
          maxLength={60}
          autoComplete="name"
        />
      </div>
      <p className="text-sm text-text-2">{t('register.hint')}</p>
      {busy && (
        <p aria-live="polite" className="text-sm text-text-2">
          {c('state.working')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <Button type="submit" aria-busy={busy} disabled={busy || !displayName.trim()}>
        {t('register.submit')}
      </Button>
    </form>
  )
}
