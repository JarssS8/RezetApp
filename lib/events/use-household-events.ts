'use client'
import { useEffect, useRef } from 'react'
import type { HouseholdEvent } from './bus'

// Suscripción SSE por hogar. Los clientes refrescan datos al recibir el evento; sin Last-Event-ID (spec §14).
// EventSource reconecta solo; no hace falta gestionar la reconexión a mano.
export function useHouseholdEvents(handler: (e: HouseholdEvent) => void, types?: HouseholdEvent['type'][]): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  }, [handler])
  useEffect(() => {
    const es = new EventSource('/api/events')
    const wanted: HouseholdEvent['type'][] = types ?? ['plan.changed', 'pantry.changed', 'recipe.changed', 'proposal.created']
    const onEvent = (ev: MessageEvent<string>) => {
      try {
        ref.current(JSON.parse(ev.data) as HouseholdEvent)
      } catch {
        // datos malformados: ignorar
      }
    }
    for (const t of wanted) es.addEventListener(t, onEvent as EventListener)
    return () => es.close()
  }, [types])
}
