import { RouteLoading, Skeleton } from '@/components/ui/route-loading'

// Cocinar: título y la lista de lo cocinable hoy (una fila por entrada).
export default function Loading() {
  return (
    <RouteLoading>
      <Skeleton className="h-9 w-28" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    </RouteLoading>
  )
}
