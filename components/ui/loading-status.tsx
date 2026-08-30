'use client'
import { useTranslations } from 'next-intl'

// El aviso de "cargando" para lector de pantalla. Es de cliente para que
// RouteLoading pueda ser síncrono: un fallback de <Suspense> que se suspende
// (getTranslations lee cookies) no entra en el prerender de la ruta.
export function LoadingStatus() {
  const c = useTranslations('common')
  return (
    <span role="status" className="sr-only">
      {c('state.loading')}
    </span>
  )
}
