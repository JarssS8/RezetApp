'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useHouseholdEvents } from '@/lib/events/use-household-events'

// Refresca /recipes (server component) cuando otro dispositivo del hogar
// crea, edita o borra una receta -mismo patrón que pantry-list.tsx-. No
// pinta nada: solo suscribe la pestaña actual a los eventos del hogar.
export function RecipesLiveRefresh() {
  const router = useRouter()
  useHouseholdEvents(
    useCallback(() => router.refresh(), [router]),
    ['recipe.changed'],
  )
  return null
}
