'use client'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function InviteAcceptButton({ token, displayName }: { token: string; displayName: string }) {
  const t = useTranslations('auth')
  const c = useTranslations('common')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await res.json()) as { redirect?: string }
      if (!res.ok || !data.redirect) throw new Error('accept')
      router.push(data.redirect)
    } catch {
      setError(t('errors.generic'))
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
      <Button type="button" onClick={onClick} aria-busy={busy} disabled={busy} data-testid="invite-accept-button">
        {t('invite.joinAs', { name: displayName })}
      </Button>
    </div>
  )
}
