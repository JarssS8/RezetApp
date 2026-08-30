import { RouteLoading, Skeleton } from '@/components/ui/route-loading'

// La forma aproximada de cada una de las cinco pantallas mientras su
// contenido llega. Vive aquí, y no dentro de cada `loading.tsx`, porque hacen
// falta en dos sitios a la vez (W10/T11b): el `loading.tsx` del segmento, que
// cubre la navegación entera, y el `<Suspense>` que cada página pone alrededor
// de su contenido, que es lo que hace que la ruta tenga armazón (`◐`) y
// ventana de cliente. Duplicar el esqueleto en los dos sitios se
// desincronizaría al primer retoque.
//
// Todos son síncronos: un fallback que se suspende no se prerenderiza.

export function TodaySkeleton() {
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

export function PlanSkeleton() {
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

export function RecipesSkeleton() {
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

export function PantrySkeleton() {
  return (
    <RouteLoading>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-11 w-32 rounded-pill" />
      </div>
      <Skeleton className="h-11 w-full rounded-sm" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </RouteLoading>
  )
}

export function CookSkeleton() {
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
