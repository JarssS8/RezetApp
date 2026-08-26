'use client'

import { startRegistration } from '@simplewebauthn/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon } from '@/components/icons'

// Alta de una passkey adicional desde ajustes: sin campo de nombre (se
// renombra después, inline, en PasskeysPanel).
export function AddPasskeyButton() {
  const t = useTranslations('settings')
  const a = useTranslations('auth')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  async function onClick() {
    setBusy(true)
    setError(null)
    setAdded(false)
    try {
      const opt = await fetch('/api/auth/passkeys/options', { method: 'POST' })
      if (!opt.ok) throw new Error('options')
      const { challengeId, options } = (await opt.json()) as { challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }
      const response = await startRegistration({ optionsJSON: options })
      const ver = await fetch('/api/auth/passkeys/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, response, name: null }),
      })
      if (!ver.ok) throw new Error('verify')
      setAdded(true)
      router.refresh()
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setError(name === 'NotAllowedError' ? a('errors.cancelled') : name === 'NotSupportedError' ? a('errors.unsupported') : a('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={onClick} aria-busy={busy} disabled={busy}>
        <PlusIcon size={16} />
        {t('passkeys.add')}
      </Button>
      {added && <p className="text-sm text-text-2">{t('passkeys.added')}</p>}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  )
}
