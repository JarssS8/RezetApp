import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { BarcodeIcon, MergeIcon, PlusIcon } from '@/components/icons'
import { ExpiringPanel } from '@/components/pantry/expiring-panel'
import { PantryList } from '@/components/pantry/pantry-list'
import { Input } from '@/components/ui/input'
import { ScreenHeader } from '@/components/ui/screen-header'
import { PantrySkeleton } from '@/components/ui/screen-skeletons'
import { requireHousehold } from '@/lib/auth/guards'
import { utcDayIso } from '@/lib/cache/ctx'
import { getHouseholdOverviewCached } from '@/lib/cache/household'
import { getExpiringPantry, getPantryList } from '@/lib/cache/pantry'
import { PantryQuerySchema } from '@/lib/validation/pantry'

interface PantryPageProps {
  searchParams: Promise<{ location?: string; q?: string }>
}

// W10/T11b: cascarón síncrono + <Suspense>. La promesa de searchParams se
// pasa hacia dentro sin esperarla, igual que la sesión y las traducciones
// ("Push dynamic access down"): esperar cualquiera de las tres aquí deja la
// ruta sin armazón estático y sin ventana de cliente.
export default function PantryPage({ searchParams }: PantryPageProps) {
  return (
    <Suspense fallback={<PantrySkeleton />}>
      <PantryContent searchParams={searchParams} />
    </Suspense>
  )
}

async function PantryContent({ searchParams }: PantryPageProps) {
  const t = await getTranslations('pantry')
  const ctx = await requireHousehold()
  const sp = await searchParams
  const parsedQuery = PantryQuerySchema.safeParse({ location: sp.location, q: sp.q })
  const query = parsedQuery.success ? parsedQuery.data : {}
  const today = utcDayIso()
  const [items, household] = await Promise.all([
    getPantryList(ctx.householdId, ctx.locale, today, query),
    getHouseholdOverviewCached(ctx.householdId, ctx.locale),
  ])
  const expiring = await getExpiringPantry(ctx.householdId, ctx.locale, today, household.expiryAlertDays)

  return (
    <main className="view-enter">
      {/* W8: patrón único de cabecera; menú desbordado con escanear/fusionar. */}
      <ScreenHeader
        title={t('title')}
        primaryAction={{ ariaLabel: t('add'), icon: <PlusIcon />, href: '/pantry/add' }}
        menuItems={[
          { key: 'scan', label: t('scan.title'), icon: <BarcodeIcon size={18} />, href: '/pantry/scan' },
          { key: 'merge', label: t('merge.title'), icon: <MergeIcon size={18} />, href: '/pantry/merge' },
        ]}
      />
      <ExpiringPanel items={expiring} />
      <form method="get" className="mt-4">
        {query.location ? <input type="hidden" name="location" value={query.location} /> : null}
        <Input type="search" name="q" defaultValue={query.q ?? ''} placeholder={t('search')} aria-label={t('search')} />
      </form>
      <PantryList items={items} unitSystem={ctx.session.user.units} />
    </main>
  )
}
