import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BarcodeIcon, MergeIcon, PlusIcon } from '@/components/icons'
import { ExpiringPanel } from '@/components/pantry/expiring-panel'
import { PantryList } from '@/components/pantry/pantry-list'
import { Input } from '@/components/ui/input'
import { requireHousehold } from '@/lib/auth/guards'
import { getHouseholdOverview } from '@/lib/services/households'
import { expiringPantry, listPantry } from '@/lib/services/pantry'
import { PantryQuerySchema } from '@/lib/validation/pantry'

interface PantryPageProps {
  searchParams: Promise<{ location?: string; q?: string }>
}

export default async function PantryPage({ searchParams }: PantryPageProps) {
  const t = await getTranslations('pantry')
  const ctx = await requireHousehold()
  const sp = await searchParams
  const parsedQuery = PantryQuerySchema.safeParse({ location: sp.location, q: sp.q })
  const query = parsedQuery.success ? parsedQuery.data : {}
  const [items, household] = await Promise.all([listPantry(ctx, query), getHouseholdOverview(ctx)])
  const expiring = await expiringPantry(ctx, household.expiryAlertDays)

  return (
    <main>
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-screen">{t('title')}</h1>
        <div className="flex items-center gap-1">
          <Link href="/pantry/merge" aria-label={t('merge.title')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2">
            <MergeIcon />
          </Link>
          <Link href="/pantry/scan" aria-label={t('scan.title')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2">
            <BarcodeIcon />
          </Link>
          <Link href="/pantry/add" aria-label={t('add')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-primary text-primary-foreground">
            <PlusIcon />
          </Link>
        </div>
      </div>
      <ExpiringPanel items={expiring} />
      <form method="get" className="mt-4">
        {query.location ? <input type="hidden" name="location" value={query.location} /> : null}
        <Input type="search" name="q" defaultValue={query.q ?? ''} placeholder={t('search')} aria-label={t('search')} />
      </form>
      <PantryList items={items} unitSystem={ctx.session.user.units} />
    </main>
  )
}
