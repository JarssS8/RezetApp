import { getLocale, getTranslations } from 'next-intl/server'
import { PlanLiveRefresh } from '@/components/plan/plan-live-refresh'
import { ShoppingPushButton } from '@/components/plan/shopping-push-button'
import { ShoppingSummary } from '@/components/plan/shopping-summary'
import { requireHousehold } from '@/lib/auth/guards'
import { getShopListLinkAction } from '@/lib/actions/shopping'
import { todayIso, weekRange } from '@/lib/plan-dates'
import { generateShopping } from '@/lib/services/shopping'

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

// /plan/shopping?from&to — lista de compra consolidada, con botón de envío a
// ShopList cuando el hogar (o el entorno) tiene la integración configurada.
export default async function PlanShoppingPage({ searchParams }: PlanShoppingPageProps) {
  const ctx = await requireHousehold()
  const sp = await searchParams
  const t = await getTranslations('plan')

  const range = resolveRange(sp)
  const [{ lines }, linkResult] = await Promise.all([generateShopping(ctx, range), getShopListLinkAction()])
  const deepLink = linkResult.ok ? linkResult.data.deepLink : null

  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const rangeText = t('shopping.range', { from: dateFormat.format(new Date(`${range.from}T00:00:00`)), to: dateFormat.format(new Date(`${range.to}T00:00:00`)) })

  return (
    <main className="flex flex-col gap-3 pb-4">
      <PlanLiveRefresh types={['plan.changed', 'pantry.changed']} />
      <div>
        <h1 className="text-2xl">{t('shopping.title')}</h1>
        <p className="text-sm text-text-2">{rangeText}</p>
      </div>
      <ShoppingSummary lines={lines} />
      <ShoppingPushButton lines={lines} canPush={deepLink !== null} deepLink={deepLink} />
    </main>
  )
}
