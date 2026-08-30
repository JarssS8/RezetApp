import { PlanSkeleton } from '@/components/ui/screen-skeletons'

// Plan: título y la semana en columnas (7 días, como week-view.tsx).
// El mismo esqueleto que la página usa como fallback de su <Suspense>: este
// cubre la navegación entera al segmento, aquel el contenido dentro de una
// pantalla ya montada.
export default function Loading() {
  return <PlanSkeleton />
}
