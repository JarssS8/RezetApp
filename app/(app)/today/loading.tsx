import { TodaySkeleton } from '@/components/ui/screen-skeletons'

// Hoy: título, anillo de kcal y una lista corta de comidas del día.
// El mismo esqueleto que la página usa como fallback de su <Suspense>: este
// cubre la navegación entera al segmento, aquel el contenido dentro de una
// pantalla ya montada.
export default function Loading() {
  return <TodaySkeleton />
}
