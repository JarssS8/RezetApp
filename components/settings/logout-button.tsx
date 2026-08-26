'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { LogoutIcon } from '@/components/icons'

export function LogoutButton() {
  const t = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} aria-busy={pending} disabled={pending}>
      <LogoutIcon size={16} />
      {t('logout')}
    </Button>
  )
}
