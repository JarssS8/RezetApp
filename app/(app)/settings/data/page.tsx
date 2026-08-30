import { getTranslations } from 'next-intl/server'
import { ExportButton } from '@/components/settings/export-button'
import { ImportButton } from '@/components/settings/import-button'
import { requireHousehold } from '@/lib/auth/guards'

// Exportación e importación de recetas (JSON del hogar). La migración desde
// otras apps (Mealie, Tandoor) se hace por línea de comandos, ver §04-DATOS.
export default async function Page() {
  const t = await getTranslations('settings')
  // Esta pantalla no pinta datos del hogar, pero sigue siendo pantalla de
  // dentro: desde que la guardia del marco vive detrás de un <Suspense>
  // (T11b), la única que decide quién la ve es la de la propia página.
  await requireHousehold()
  return (
    <div className="view-enter">
      <h2 className="text-lg">{t('sections.data')}</h2>
      <p className="mt-1 text-text-2">{t('data.exportHint')}</p>
      <div className="mt-3">
        <ExportButton />
      </div>
      <h3 className="mt-6 text-base">{t('data.import')}</h3>
      <p className="mt-1 text-text-2">{t('data.importHint')}</p>
      <div className="mt-3">
        <ImportButton />
      </div>
      <h3 className="mt-6 text-base">{t('data.migrate')}</h3>
      <p className="mt-1 text-sm text-text-2">{t('data.migrateHint')}</p>
    </div>
  )
}
