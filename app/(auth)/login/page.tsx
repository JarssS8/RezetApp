import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button'
import { Card } from '@/components/ui/card'
import { getCurrentSession } from '@/lib/auth/guards'

export default async function LoginPage() {
  if (await getCurrentSession()) redirect('/today')
  const t = await getTranslations('auth')
  return (
    <Card className="mx-auto w-full max-w-sm p-6 shadow-hero">
      <h1 className="title-content">{t('login.title')}</h1>
      <div className="mt-6">
        <PasskeyLoginButton />
      </div>
      <p className="mt-6 text-sm text-text-2">
        {t('login.noAccount')}{' '}
        <Link href="/register" className="text-acc-ink underline">
          {t('login.register')}
        </Link>
      </p>
    </Card>
  )
}
