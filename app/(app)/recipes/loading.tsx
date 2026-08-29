import { RouteLoading, Skeleton } from '@/components/ui/route-loading'

// Recetas: título con acciones, filtros y la rejilla de tarjetas.
export default function Loading() {
  return (
    <RouteLoading>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-11 w-32 rounded-pill" />
      </div>
      <Skeleton className="h-11 w-full rounded-sm" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-video w-full rounded-md" />
        ))}
      </div>
    </RouteLoading>
  )
}
