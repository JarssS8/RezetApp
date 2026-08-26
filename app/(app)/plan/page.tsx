import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { WeekView } from '@/components/plan/week-view'
import { requireHousehold } from '@/lib/auth/guards'
import { todayIso, weekRange } from '@/lib/plan-dates'
import { listEntries, rangeNutrition } from '@/lib/services/plan'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanPageProps {
  searchParams: Promise<SearchParams>
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

// /plan?week=YYYY-MM-DD — la semana visible siempre empieza en lunes (regla
// de controlador); si el parámetro no es exactamente ese lunes (falta, es
// otro día de la semana, o no tiene formato válido) se normaliza con un
// redirect, conservando ?add y ?servings si venían del enlace de una receta.
export default async function PlanPage({ searchParams }: PlanPageProps) {
  const ctx = await requireHousehold()
  const sp = await searchParams
  const t = await getTranslations('plan')

  const today = todayIso()
  const requestedWeek = firstParam(sp.week)
  const baseDate = requestedWeek && ISO_DATE.test(requestedWeek) ? requestedWeek : today
  const { from: monday, days } = weekRange(baseDate)

  if (requestedWeek !== undefined && requestedWeek !== monday) {
    const params = new URLSearchParams({ week: monday })
    const add = firstParam(sp.add)
    if (add) params.set('add', add)
    const servingsParam = firstParam(sp.servings)
    if (servingsParam) params.set('servings', servingsParam)
    redirect(`/plan?${params.toString()}`)
  }

  const range = { from: monday, to: days[days.length - 1] as string }
  const [entries, nutrition] = await Promise.all([listEntries(ctx, range), rangeNutrition(ctx, range)])
  const kcalByDate: Record<string, number> = {}
  for (const [date, n] of Object.entries(nutrition.byDate)) kcalByDate[date] = Math.round(n.total.kcal)

  const addRecipeId = firstParam(sp.add) ?? null
  const addServingsRaw = firstParam(sp.servings)
  const parsedAddServings = addServingsRaw ? Number.parseInt(addServingsRaw, 10) : 0

  return (
    <main className="flex flex-col gap-3 pb-4">
      <h1 className="text-2xl">{t('title')}</h1>
      <WeekView
        monday={monday}
        days={days}
        entries={entries}
        defaultServings={ctx.session.household.defaultServings}
        kcalByDate={kcalByDate}
        todayIso={today}
        initialAddRecipeId={addRecipeId}
        initialAddServings={Number.isFinite(parsedAddServings) ? parsedAddServings : 0}
      />
    </main>
  )
}
