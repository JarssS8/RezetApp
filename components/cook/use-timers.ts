'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { remainingOf, useTimersStore, type TimerState } from '@/lib/timers-store'

export interface CookTimer {
  id: string
  label: string
  totalSeconds: number
  remaining: number
  running: boolean
}

export interface TimersApi {
  timers: CookTimer[]
  start: (id: string, seconds: number, label: string) => void
  toggle: (id: string) => void
  reset: (id: string) => void
  dismiss: (id: string) => void
}

function toPublic(t: TimerState, now: number): CookTimer {
  return { id: t.id, label: t.label, totalSeconds: t.totalSeconds, remaining: remainingOf(t, now), running: t.running }
}

// Un temporizador corriendo ancla su fin en reloj de pared (`endsAt`, epoch
// ms), no en "voy restando 1 cada segundo" (fix 5 de la revisión final): si
// el dispositivo se suspende (pantalla bloqueada, portátil en reposo) el
// `setInterval` se congela con él, y al despertar solo dispara UN tick — restar
// de uno en uno dejaría el temporizador contando varios minutos de más
// respecto al reloj real, justo lo contrario de lo que alguien en la cocina
// espera de un aviso. Con `endsAt`, ese primer tick tras despertar (o el
// `visibilitychange` al volver a la pestaña) recalcula `remaining` desde
// `Date.now()` y colapsa de golpe al valor correcto, incluido cero.
//
// W9: el estado real (`endsAt`, `pausedRemaining`…) vive en lib/timers-store,
// fuera de React — este hook es ahora solo un selector fino sobre ese store,
// con `sessionKey` (receta/entrada del plan) para que dos sesiones de cocina
// no mezclen temporizadores. Así sobreviven a navegar a otra pantalla y
// volver, y al remontaje del paso actual dentro de la misma sesión.
export function useTimers(sessionKey: string, onFinish?: (timer: CookTimer) => void): TimersApi {
  const session = useTimersStore((state) => state.sessions[sessionKey])
  const startAction = useTimersStore((state) => state.start)
  const toggleAction = useTimersStore((state) => state.toggle)
  const resetAction = useTimersStore((state) => state.reset)
  const dismissAction = useTimersStore((state) => state.dismiss)
  const tickAction = useTimersStore((state) => state.tick)
  const [now, setNow] = useState(() => Date.now())
  const finishRef = useRef(onFinish)
  useEffect(() => {
    finishRef.current = onFinish
  }, [onFinish])

  const timers = session ?? {}
  const anyRunning = Object.values(timers).some((t) => t.running && remainingOf(t, now) > 0)

  // Recalcula desde el reloj y detecta finales: nunca resta ciegamente, así
  // que da igual cuánto haya tardado en llegar este tick.
  const tick = useCallback(() => {
    const at = Date.now()
    setNow(at)
    const finished = tickAction(at)
    // El aviso se dispara fuera de la actualización del store para no
    // depender de cuántas veces la invoque internamente zustand.
    for (const t of finished) queueMicrotask(() => finishRef.current?.(toPublic(t, at)))
  }, [tickAction])

  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [anyRunning, tick])

  // Un móvil bloqueado o una pestaña en segundo plano puede pasar minutos sin
  // que el intervalo llegue a dispararse (los navegadores lo limitan ahí): al
  // volver a primer plano se recalcula enseguida en vez de esperar al
  // siguiente tick, que es exactamente el mismo caso que un dispositivo
  // suspendido.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [tick])

  const start = useCallback((id: string, seconds: number, label: string) => startAction(sessionKey, id, seconds, label), [startAction, sessionKey])
  const toggle = useCallback((id: string) => toggleAction(sessionKey, id), [toggleAction, sessionKey])
  const reset = useCallback((id: string) => resetAction(sessionKey, id), [resetAction, sessionKey])
  const dismiss = useCallback((id: string) => dismissAction(sessionKey, id), [dismissAction, sessionKey])

  return { timers: Object.values(timers).map((t) => toPublic(t, now)), start, toggle, reset, dismiss }
}
