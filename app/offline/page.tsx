import { getTranslations } from 'next-intl/server'

// Página del armazón que precachea el service worker. Sin datos y sin sesión:
// es lo único que se puede enseñar sin red.
export default async function OfflinePage() {
  const c = await getTranslations('common')
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="font-display text-2xl">{c('offline.title')}</h1>
      <p className="text-text-2">{c('offline.hint')}</p>
    </main>
  )
}
