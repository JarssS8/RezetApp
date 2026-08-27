'use client'

import { useEffect } from 'react'

// Mantiene la pantalla encendida mientras se cocina. Fallback silencioso
// (spec §8): Safari/iOS y los navegadores sin la API simplemente no lo hacen,
// y eso NO es un error que deba verse en la interfaz.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) await lock.release()
        else sentinel = lock
      } catch {
        // denegado o no soportado: se cocina igual
      }
    }

    // El sistema suelta el bloqueo al ocultar la pestaña; se vuelve a pedir al volver.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}
