import { Skeleton } from '@/components/ui/skeleton'
import { LoadingStatus } from './loading-status'

// `loading.tsx` por segmento (auditoría W7, hallazgo 8.4): antes, navegar
// dejaba la pantalla anterior congelada sin ninguna señal mientras el
// servidor resolvía sus `await`. Envoltorio común para los cinco
// `loading.tsx` de app/(app)/* y para los `<Suspense>` que las propias
// pantallas ponen alrededor de su contenido: la forma aproximada de cada
// pantalla la pone quien lo usa (children); esto solo pone el `view-enter` y
// el aviso para lector de pantalla.
//
// W10/T11b: es síncrono. Con `getTranslations` era un componente asíncrono, y
// un fallback que se suspende a sí mismo no puede entrar en el prerender —
// dejaba el armazón de la ruta vacío. El texto traducido lo pone ahora
// LoadingStatus, un componente de cliente que lee el mismo mensaje del
// proveedor de next-intl sin esperar a nada.
export function RouteLoading({ children }: { children: React.ReactNode }) {
  return (
    <div className="view-enter flex flex-col gap-4">
      <LoadingStatus />
      {children}
    </div>
  )
}

export { Skeleton }
