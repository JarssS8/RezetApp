'use client'
import { startAuthentication } from '@simplewebauthn/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function PasskeyLoginButton({ inviteToken }: { inviteToken?: string }) {
  const t = useTranslations('auth')
  const c = useTranslations('common')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const opt = await fetch('/api/auth/login/options', { method: 'POST' })
      if (!opt.ok) throw new Error('options')
      const { challengeId, options } = (await opt.json()) as { challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }
      const response = await startAuthentication({ optionsJSON: options })
      const ver = await fetch('/api/auth/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, inviteToken, response }),
      })
      const data = (await ver.json()) as { redirect?: string }
      if (!ver.ok || !data.redirect) throw new Error('verify')
      router.push(data.redirect)
    } catch (err) {
      setError(err instanceof Error && err.name === 'NotAllowedError' ? t('errors.cancelled') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {busy && (
        <p aria-live="polite" className="text-sm text-text-2">
          {c('state.working')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      )}
      <Button type="button" onClick={onClick} aria-busy={busy} disabled={busy} data-testid="login-button">
        {t('login.submit')}
      </Button>
    </div>
  )
}
