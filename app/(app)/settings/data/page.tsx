import { getTranslations } from 'next-intl/server'

// El botón de exportar recetas vive en otra pista (a) y se conecta aquí
// cuando esa acción esté mergeada; por ahora solo se explica qué llega y cuándo.
export default async function Page() {
  const t = await getTranslations('settings')
  return (
    <div>
      <h2 className="text-lg">{t('sections.data')}</h2>
      <p className="mt-1 text-text-2">{t('data.exportHint')}</p>
      <p className="mt-4 text-sm text-text-2">{t('data.importSoon')}</p>
    </div>
  )
}
