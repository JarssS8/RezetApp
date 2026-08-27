import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BarcodeIcon, PlusIcon } from '@/components/icons'
import { ExpiringPanel } from '@/components/pantry/expiring-panel'
import { PantryList } from '@/components/pantry/pantry-list'
import { Button } from '@/components/ui/button'
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
        <h1 className="text-2xl">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/pantry/scan" />} variant="outline" size="icon" aria-label={t('scan.title')}>
            <BarcodeIcon size={20} />
          </Button>
          <Button render={<Link href="/pantry/add" />} size="icon" aria-label={t('add')}>
            <PlusIcon size={20} />
          </Button>
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
