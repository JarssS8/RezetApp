'use client'
import { useEffect, useRef } from 'react'
import type { HouseholdEvent } from './bus'

const ALL_TYPES: HouseholdEvent['type'][] = ['plan.changed', 'pantry.changed', 'recipe.changed', 'proposal.created']

// Suscripción SSE por hogar. Los clientes refrescan datos al recibir el evento; sin Last-Event-ID (spec §14).
// EventSource reconecta solo, así que onerror no cierra ni reabre nada: solo avisa
// a quien haya pasado onError (para pintar "sin conexión", por ejemplo) y calla.
// La dependencia del efecto es la lista de tipos unida en una cadena, no el array:
// con `useHouseholdEvents(fn, ['plan.changed'])` el array es nuevo en cada render y
// la identidad haría cerrar y reabrir la conexión en cada uno.
export function useHouseholdEvents(handler: (e: HouseholdEvent) => void, types?: HouseholdEvent['type'][], onError?: () => void): void {
  const ref = useRef(handler)
  const errorRef = useRef(onError)
  useEffect(() => {
    ref.current = handler
    errorRef.current = onError
  }, [handler, onError])
  const key = (types ?? ALL_TYPES).join(',')
  useEffect(() => {
    const es = new EventSource('/api/events')
    const onEvent = (ev: MessageEvent<string>) => {
      try {
        ref.current(JSON.parse(ev.data) as HouseholdEvent)
      } catch {
        // datos malformados: ignorar
      }
    }
    for (const t of key.split(',')) es.addEventListener(t, onEvent as EventListener)
    es.onerror = () => errorRef.current?.()
    return () => es.close()
  }, [key])
}
