import { getTranslations } from 'next-intl/server'
import { SparklesIcon } from '@/components/icons'
import { ProposalsList } from '@/components/plan/proposal-card'
import type { ProposalClient } from '@/components/plan/types'
import { EmptyState } from '@/components/ui/empty-state'
import { ScreenHeader } from '@/components/ui/screen-header'
import { requireHousehold } from '@/lib/auth/guards'
import { getProposals } from '@/lib/cache/plan'
import type { ProposalView } from '@/lib/services/plan'

// Pendientes primero, y dentro de cada grupo por fecha de creación
// descendente (regla de controlador; el servicio no impone este orden).
function sortProposals(proposals: ProposalView[]): ProposalView[] {
  return [...proposals].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0
  })
}

export default async function PlanProposalsPage() {
  const ctx = await requireHousehold()
  const t = await getTranslations('plan')
  const proposals = sortProposals(await getProposals(ctx.householdId, ctx.locale, false))
  const proposalsClient: ProposalClient[] = proposals.map((p) => ({
    id: p.id,
    source: p.source,
    status: p.status,
    createdAt: p.createdAt,
    diff: p.diff,
  }))

  return (
    <main className="view-enter flex flex-col gap-3 pb-4">
      {/* W8: subpantalla sin pestaña propia; vuelve a Plan. */}
      <ScreenHeader title={t('proposals.title')} backHref="/plan" />
      {proposalsClient.length === 0 ? <EmptyState icon={SparklesIcon} title={t('proposals.empty')} /> : null}
      <ProposalsList proposals={proposalsClient} />
    </main>
  )
}
