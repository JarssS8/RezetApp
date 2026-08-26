import { getTranslations } from 'next-intl/server'
import { MembersPanel } from '@/components/settings/members-panel'
import { createInviteAction, removeMemberAction, updateMemberAction } from '@/lib/actions/settings'
import { requireHousehold } from '@/lib/auth/guards'
import { listMembers } from '@/lib/services/members'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const members = await listMembers(ctx)
  return (
    <div>
      <h2 className="text-lg">{t('sections.members')}</h2>
      <div className="mt-4">
        <MembersPanel
          members={members}
          currentUserId={ctx.session.user.id}
          isOwner={ctx.role === 'owner'}
          updateAction={updateMemberAction}
          removeAction={removeMemberAction}
          createInviteAction={createInviteAction}
        />
      </div>
    </div>
  )
}
