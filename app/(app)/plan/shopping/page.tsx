import { getTranslations } from 'next-intl/server'
import { ShoppingSummary } from '@/components/plan/shopping-summary'
import { requireHousehold } from '@/lib/auth/guards'
import { consolidateNeeds } from '@/lib/domain'
import { todayIso, weekRange } from '@/lib/plan-dates'
import { pantryForShopping, plannedEntriesForShopping } from '@/lib/services/plan'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanShoppingPageProps {
  searchParams: Promise<SearchParams>
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

// Rango del resumen: ?from&to si son fechas ISO válidas y ordenadas; si no,
// la semana actual. A diferencia de /plan, un parámetro inválido no redirige
// (no hay aquí una fecha "canónica" que forzar): cae en silencio al defecto.
function resolveRange(sp: SearchParams): { from: string; to: string } {
  const from = firstParam(sp.from)
  const to = firstParam(sp.to)
  if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to) return { from, to }
  const week = weekRange(todayIso())
  return { from: week.from, to: week.to }
}

// /plan/shopping?from&to — lista de compra consolidada (sin botón de envío a
// ShopList: lo añade la pista (f)). pantryForShopping vive aquí de forma
// provisional; (f) la sustituye por pantryAsDomain de (d) al mergear.
export default async function PlanShoppingPage({ searchParams }: PlanShoppingPageProps) {
  const ctx = await requireHousehold()
  const sp = await searchParams
  const t = await getTranslations('plan')

  const range = resolveRange(sp)
  const [entries, pantry] = await Promise.all([plannedEntriesForShopping(ctx, range), pantryForShopping(ctx)])
  const lines = consolidateNeeds(entries, pantry)

  return (
    <main className="flex flex-col gap-3 pb-4">
      <h1 className="text-2xl">{t('shopping.title')}</h1>
      <ShoppingSummary lines={lines} />
    </main>
  )
}
