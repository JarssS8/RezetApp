'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { HouseholdEvent } from '@/lib/events/bus'
import { useHouseholdEvents } from '@/lib/events/use-household-events'

export interface PlanLiveRefreshProps {
  types?: HouseholdEvent['type'][]
}

// Mismo patrón que components/recipes/recipes-live-refresh.tsx: un componente
// de cliente que no pinta nada y solo suscribe la página (Server Component) a
// los eventos del hogar. La vista mensual y el resumen de compra son server
// components puros, así que no tenían dónde llamar a useHouseholdEvents.
export function PlanLiveRefresh({ types = ['plan.changed'] }: PlanLiveRefreshProps) {
  const router = useRouter()
  useHouseholdEvents(
    useCallback(() => router.refresh(), [router]),
    types,
  )
  return null
}
