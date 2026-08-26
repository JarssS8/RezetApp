import { getTranslations } from 'next-intl/server'
import { DangerZone } from '@/components/settings/danger-zone'
import { HouseholdForm, HouseholdSwitcher } from '@/components/settings/household-form'
import { deleteHouseholdAction, leaveHouseholdAction, switchHouseholdAction, updateHouseholdAction } from '@/lib/actions/settings'
import { requireHousehold } from '@/lib/auth/guards'
import { getHouseholdOverview, listHouseholdsOf } from '@/lib/services/households'

export default async function Page() {
  const t = await getTranslations('settings')
  const ctx = await requireHousehold()
  const [overview, households] = await Promise.all([getHouseholdOverview(ctx), listHouseholdsOf(ctx.db, ctx.session.user.id)])
  const isOwner = ctx.role === 'owner'
  // Solo puede salir un miembro, o un propietario si queda otro propietario:
  // el último propietario tiene que borrar el hogar o nombrar antes a otro.
  const ownerCount = overview.members.filter((m) => m.role === 'owner').length
  const canLeave = !isOwner || ownerCount > 1

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg">{t('sections.household')}</h2>
        <div className="mt-4">
          <HouseholdForm initial={{ id: overview.id, name: overview.name, defaultServings: overview.defaultServings, expiryAlertDays: overview.expiryAlertDays }} isOwner={isOwner} updateAction={updateHouseholdAction} />
        </div>
      </div>
      <HouseholdSwitcher households={households} currentId={ctx.householdId} switchAction={switchHouseholdAction} />
      <DangerZone householdName={overview.name} isOwner={isOwner} canLeave={canLeave} leaveAction={leaveHouseholdAction} deleteAction={deleteHouseholdAction} />
    </div>
  )
}
