import { RecipesSkeleton } from '@/components/ui/screen-skeletons'

// Recetas: título con acciones, filtros y la rejilla de tarjetas.
// El mismo esqueleto que la página usa como fallback de su <Suspense>: este
// cubre la navegación entera al segmento, aquel el contenido dentro de una
// pantalla ya montada.
export default function Loading() {
  return <RecipesSkeleton />
}
