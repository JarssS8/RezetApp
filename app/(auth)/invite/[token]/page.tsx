import { getLocale, getTranslations } from 'next-intl/server'
import { InviteAcceptButton } from '@/components/auth/invite-accept-button'
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button'
import { PasskeyRegisterForm } from '@/components/auth/passkey-register-form'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getCurrentSession } from '@/lib/auth/guards'
import { getInviteInfo } from '@/lib/services/auth'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('auth')
  const invite = await getInviteInfo(token)
  if (!invite) {
    return (
      <Card className="mx-auto w-full max-w-sm p-6">
        <p role="alert">{t('invite.invalid')}</p>
      </Card>
    )
  }
  const session = await getCurrentSession()
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  return (
    <Card className="mx-auto w-full max-w-sm p-6">
      <h1 className="font-display text-2xl font-semibold">{t('invite.title', { household: invite.householdName })}</h1>
      <p className="mt-1 text-sm text-text-2">{t('invite.by', { name: invite.invitedBy })}</p>
      {session ? (
        <div className="mt-6">
          <InviteAcceptButton token={token} displayName={session.user.displayName} />
        </div>
      ) : (
        <>
          <h2 className="mt-6 text-base font-medium">{t('invite.newAccount')}</h2>
          <div className="mt-3">
            <PasskeyRegisterForm inviteToken={token} locale={locale} />
          </div>
          <Separator className="my-6" />
          <PasskeyLoginButton inviteToken={token} />
        </>
      )}
    </Card>
  )
}
