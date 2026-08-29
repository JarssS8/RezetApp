import { RouteLoading, Skeleton } from '@/components/ui/route-loading'

// Hoy: título, anillo de kcal y una lista corta de comidas del día.
export default function Loading() {
  return (
    <RouteLoading>
      <Skeleton className="h-9 w-32" />
      <Skeleton className="mx-auto size-48 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    </RouteLoading>
  )
}
