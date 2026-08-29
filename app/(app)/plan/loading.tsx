import { RouteLoading, Skeleton } from '@/components/ui/route-loading'

// Plan: título y la semana en columnas (7 días, como week-view.tsx).
export default function Loading() {
  return (
    <RouteLoading>
      <Skeleton className="h-9 w-24" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-md" />
        ))}
      </div>
    </RouteLoading>
  )
}
