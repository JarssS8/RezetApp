import { PantrySkeleton } from '@/components/ui/screen-skeletons'

// Despensa: título con acciones, buscador y una lista de filas.
// El mismo esqueleto que la página usa como fallback de su <Suspense>: este
// cubre la navegación entera al segmento, aquel el contenido dentro de una
// pantalla ya montada.
export default function Loading() {
  return <PantrySkeleton />
}
