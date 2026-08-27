'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

// Un temporizador corriendo ancla su fin en reloj de pared (`endsAt`, epoch
// ms), no en "voy restando 1 cada segundo" (fix 5 de la revisión final): si
// el dispositivo se suspende (pantalla bloqueada, portátil en reposo) el
// `setInterval` se congela con él, y al despertar solo dispara UN tick — restar
// de uno en uno dejaría el temporizador contando varios minutos de más
// respecto al reloj real, justo lo contrario de lo que alguien en la cocina
// espera de un aviso. Con `endsAt`, ese primer tick tras despertar (o el
// `visibilitychange` al volver a la pestaña) recalcula `remaining` desde
// `Date.now()` y colapsa de golpe al valor correcto, incluido cero.
interface TimerState {
  id: string
  label: string
  totalSeconds: number
  running: boolean
  endsAt: number | null // solo tiene sentido mientras running
  pausedRemaining: number // segundos que quedaban la última vez que se paró (pausa, fin, o recién creado)
}

function remainingOf(t: TimerState, now: number): number {
  if (!t.running || t.endsAt === null) return t.pausedRemaining
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000))
}

function toPublic(t: TimerState, now: number): CookTimer {
  return { id: t.id, label: t.label, totalSeconds: t.totalSeconds, remaining: remainingOf(t, now), running: t.running }
}

// Varios temporizadores a la vez con UN solo intervalo: uno por temporizador
// haría que los segundos se separaran entre sí (cada setInterval deriva por su
// cuenta) y en la cocina eso se nota. El intervalo solo existe mientras haya
// alguno corriendo.
export function useTimers(onFinish?: (timer: CookTimer) => void): TimersApi {
  const [internal, setInternal] = useState<TimerState[]>([])
  const [now, setNow] = useState(() => Date.now())
  const finishRef = useRef(onFinish)
  useEffect(() => {
    finishRef.current = onFinish
  }, [onFinish])

  const anyRunning = internal.some((t) => t.running && remainingOf(t, now) > 0)

  // Recalcula desde el reloj y detecta finales: nunca resta ciegamente, así
  // que da igual cuánto haya tardado en llegar este tick.
  const tick = useCallback(() => {
    const at = Date.now()
    setNow(at)
    setInternal((prev) => {
      const finished: TimerState[] = []
      const next = prev.map((t) => {
        if (!t.running) return t
        if (remainingOf(t, at) > 0) return t
        const stopped: TimerState = { ...t, running: false, endsAt: null, pausedRemaining: 0 }
        finished.push(stopped)
        return stopped
      })
      // El aviso se dispara fuera del cálculo del estado para no llamar a
      // onFinish dos veces si React reejecuta el actualizador (StrictMode).
      for (const t of finished) queueMicrotask(() => finishRef.current?.(toPublic(t, at)))
      return next
    })
  }, [])

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

  const start = useCallback((id: string, seconds: number, label: string) => {
    setInternal((prev) => {
      const timer: TimerState = { id, label, totalSeconds: seconds, running: true, endsAt: Date.now() + seconds * 1000, pausedRemaining: seconds }
      return prev.some((t) => t.id === id) ? prev.map((t) => (t.id === id ? timer : t)) : [...prev, timer]
    })
  }, [])

  const toggle = useCallback((id: string) => {
    setInternal((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const remaining = remainingOf(t, Date.now())
        if (remaining === 0) return t
        return t.running
          ? { ...t, running: false, endsAt: null, pausedRemaining: remaining }
          : { ...t, running: true, endsAt: Date.now() + remaining * 1000 }
      }),
    )
  }, [])

  const reset = useCallback((id: string) => {
    setInternal((prev) => prev.map((t) => (t.id === id ? { ...t, running: false, endsAt: null, pausedRemaining: t.totalSeconds } : t)))
  }, [])

  const dismiss = useCallback((id: string) => {
    setInternal((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { timers: internal.map((t) => toPublic(t, now)), start, toggle, reset, dismiss }
}
