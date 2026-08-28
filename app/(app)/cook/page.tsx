import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CookIcon } from '@/components/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { requireHousehold } from '@/lib/auth/guards'
import { listEntries } from '@/lib/services/plan'
import { todayIso } from '@/lib/plan-dates'

// La pestaña "Cocinar" de la barra: lo planificado para hoy que se puede
// cocinar (tiene receta y no está cocinado ni saltado). Un toque para entrar
// en el modo cocina; el resto de la pantalla lo cubre esa sesión.
export default async function CookPage() {
  const t = await getTranslations('cook')
  const ctx = await requireHousehold()
  const today = todayIso()
  const entries = await listEntries(ctx, { from: today, to: today })
  const cookable = entries.filter((e) => e.recipeId !== null && e.leftoverOfEntryId === null && e.status === 'planned')

  return (
    <main>
      <h1 className="title-screen">{t('title')}</h1>
      {cookable.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={CookIcon} title={t('empty')} />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {cookable.map((entry) => (
            <li key={entry.id}>
              <Link href={`/cook/${entry.id}`} className="flex min-h-14 items-center gap-3 rounded-md border border-line-2 bg-card px-3 shadow-card">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-acc-soft text-acc-ink">
                  <CookIcon size={22} />
                </span>
                <span className="flex-1 truncate font-medium">{entry.title}</span>
                <span className="tabular text-sm text-text-2">{t('servingsShort', { n: entry.servings })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
