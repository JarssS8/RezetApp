import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PasskeyRegisterForm } from '@/components/auth/passkey-register-form'
import { Card } from '@/components/ui/card'
import { getCurrentSession } from '@/lib/auth/guards'

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect('/today')
  const t = await getTranslations('auth')
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  return (
    <Card className="mx-auto w-full max-w-sm p-6">
      <h1 className="font-display text-2xl font-semibold">{t('register.title')}</h1>
      <div className="mt-6">
        <PasskeyRegisterForm locale={locale} />
      </div>
      <p className="mt-6 text-sm text-text-2">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className="text-acc-ink underline">
          {t('register.login')}
        </Link>
      </p>
    </Card>
  )
}
