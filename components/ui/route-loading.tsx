import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

// `loading.tsx` por segmento (auditoría W7, hallazgo 8.4): antes, navegar
// dejaba la pantalla anterior congelada sin ninguna señal mientras el
// servidor resolvía sus `await`. Envoltorio común para los cinco
// `loading.tsx` de app/(app)/*: la forma aproximada de cada pantalla la pone
// quien lo usa (children); esto solo pone el `view-enter` y el aviso para
// lector de pantalla (Server Component: sin 'use client', puede usar
// `getTranslations`).
export async function RouteLoading({ children }: { children: React.ReactNode }) {
  const c = await getTranslations('common')
  return (
    <div className="view-enter flex flex-col gap-4">
      <span role="status" className="sr-only">
        {c('state.loading')}
      </span>
      {children}
    </div>
  )
}

export { Skeleton }
