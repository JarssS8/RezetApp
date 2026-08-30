import { CookSkeleton } from '@/components/ui/screen-skeletons'

// Cocinar: título y la lista de lo cocinable hoy (una fila por entrada).
// El mismo esqueleto que la página usa como fallback de su <Suspense>: este
// cubre la navegación entera al segmento, aquel el contenido dentro de una
// pantalla ya montada.
export default function Loading() {
  return <CookSkeleton />
}
