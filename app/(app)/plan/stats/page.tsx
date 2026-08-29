import { getTranslations } from 'next-intl/server'
import { PlanStatsPanel } from '@/components/plan/plan-stats-panel'
import { requireHousehold } from '@/lib/auth/guards'
import { todayIso, weekRange } from '@/lib/plan-dates'
import { planStats } from '@/lib/services/plan'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanStatsPageProps {
  searchParams: Promise<SearchParams>
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

// /plan/stats?week=<lunes> — plan frente a realidad de esa semana. Sin
// pestaña propia (docs/01-PRODUCTO.md, AGENTS.md): vive dentro de Plan.
export default async function PlanStatsPage({ searchParams }: PlanStatsPageProps) {
  const ctx = await requireHousehold()
  const t = await getTranslations('plan')
  const sp = await searchParams
  const weekParam = firstParam(sp.week)
  const week = weekParam && ISO_DATE.test(weekParam) ? weekParam : todayIso()
  const { from, days } = weekRange(week)
  const stats = await planStats(ctx, { from, to: days[days.length - 1] as string })

  return (
    <main className="view-enter flex flex-col gap-3 pb-4">
      <h1 className="title-screen">{t('stats.title')}</h1>
      <PlanStatsPanel stats={stats} />
    </main>
  )
}
