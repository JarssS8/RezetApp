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

// Varios temporizadores a la vez con UN solo intervalo: uno por temporizador
// haría que los segundos se separaran entre sí (cada setInterval deriva por su
// cuenta) y en la cocina eso se nota. El intervalo solo existe mientras haya
// alguno corriendo.
export function useTimers(onFinish?: (timer: CookTimer) => void): TimersApi {
  const [timers, setTimers] = useState<CookTimer[]>([])
  const finishRef = useRef(onFinish)
  useEffect(() => {
    finishRef.current = onFinish
  }, [onFinish])

  const anyRunning = timers.some((t) => t.running && t.remaining > 0)

  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => {
      setTimers((prev) => {
        const finished: CookTimer[] = []
        const next = prev.map((t) => {
          if (!t.running || t.remaining === 0) return t
          const remaining = Math.max(0, t.remaining - 1)
          const updated = remaining === 0 ? { ...t, remaining, running: false } : { ...t, remaining }
          if (remaining === 0) finished.push(updated)
          return updated
        })
        // El aviso se dispara fuera del cálculo del estado para no llamar a
        // onFinish dos veces si React reejecuta el actualizador (StrictMode).
        for (const t of finished) queueMicrotask(() => finishRef.current?.(t))
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  const start = useCallback((id: string, seconds: number, label: string) => {
    setTimers((prev) => {
      const timer: CookTimer = { id, label, totalSeconds: seconds, remaining: seconds, running: true }
      return prev.some((t) => t.id === id) ? prev.map((t) => (t.id === id ? timer : t)) : [...prev, timer]
    })
  }, [])

  const toggle = useCallback((id: string) => {
    setTimers((prev) => prev.map((t) => (t.id === id && t.remaining > 0 ? { ...t, running: !t.running } : t)))
  }, [])

  const reset = useCallback((id: string) => {
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, remaining: t.totalSeconds, running: false } : t)))
  }, [])

  const dismiss = useCallback((id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { timers, start, toggle, reset, dismiss }
}
