import { RouteLoading, Skeleton } from '@/components/ui/route-loading'

// Despensa: título con acciones, buscador y una lista de filas.
export default function Loading() {
  return (
    <RouteLoading>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-11 w-32 rounded-pill" />
      </div>
      <Skeleton className="h-11 w-full rounded-sm" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    </RouteLoading>
  )
}
