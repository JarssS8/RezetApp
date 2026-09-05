import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { CookIcon } from '@/components/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { ScreenHeader } from '@/components/ui/screen-header'
import { CookSkeleton } from '@/components/ui/screen-skeletons'
import { requireHousehold } from '@/lib/auth/guards'
import { getPlanEntries } from '@/lib/cache/plan'
import { todayIso } from '@/lib/plan-dates'

// Antes la pestaña "Cocinar" de la barra; ahora Cocinar se lanza desde Hoy o
// desde el detalle de receta (rediseño 2026-09) y esta ruta ya no tiene enlace
// de navegación propio. Lo planificado para hoy que se puede cocinar (tiene
// receta y no está cocinado ni saltado). Un toque para entrar en el modo
// cocina; el resto de la pantalla lo cubre esa sesión.
// W10/T11b: cascarón síncrono + <Suspense>. Ni la sesión ni las traducciones
// (que leen la cookie de idioma) pueden esperarse en el cuerpo de la página:
// dejarían la ruta sin armazón estático y sin ventana de cliente.
export default function CookPage() {
  return (
    <Suspense fallback={<CookSkeleton />}>
      <CookContent />
    </Suspense>
  )
}

async function CookContent() {
  const t = await getTranslations('cook')
  const ctx = await requireHousehold()
  const today = todayIso()
  const entries = await getPlanEntries(ctx.householdId, ctx.locale, today, today)
  const cookable = entries.filter((e) => e.recipeId !== null && e.leftoverOfEntryId === null && e.status === 'planned')

  return (
    <main className="view-enter">
      {/* W8: patrón único de cabecera; Cocinar no tiene acción primaria ni menú. */}
      <ScreenHeader title={t('title')} />
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
