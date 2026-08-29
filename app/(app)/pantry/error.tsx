'use client'

import { RouteError } from '@/components/ui/route-error'

// Segmento «pantry» (auditoría W7, hallazgo 8.4). Ver components/ui/route-error.tsx.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />
}
