import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PasskeyRegisterForm } from '@/components/auth/passkey-register-form'
import { Card } from '@/components/ui/card'
import { getCurrentSession } from '@/lib/auth/guards'
import { registrationOpen } from '@/lib/services/auth'

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect('/today')
  const t = await getTranslations('auth')
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  // Registro cerrado (regla W1-R18): sin invitación no hay formulario que valga
  const open = await registrationOpen()
  return (
    <Card className="mx-auto w-full max-w-sm p-6 shadow-hero">
      <h1 className="title-content">{t('register.title')}</h1>
      <div className="mt-6">
        {open ? <PasskeyRegisterForm locale={locale} /> : <p role="status">{t('register.closed')}</p>}
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
