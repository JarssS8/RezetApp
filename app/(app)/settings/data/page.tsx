import { getTranslations } from 'next-intl/server'
import { ExportButton } from '@/components/settings/export-button'

// Exportación de recetas (JSON del hogar). Importar/migrar desde otras apps
// llega en W4 (docs/07-ROADMAP.md).
export default async function Page() {
  const t = await getTranslations('settings')
  return (
    <div>
      <h2 className="text-lg">{t('sections.data')}</h2>
      <p className="mt-1 text-text-2">{t('data.exportHint')}</p>
      <div className="mt-3">
        <ExportButton />
      </div>
      <p className="mt-4 text-sm text-text-2">{t('data.importSoon')}</p>
    </div>
  )
}
