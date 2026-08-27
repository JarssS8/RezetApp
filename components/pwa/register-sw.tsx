'use client'

import { useEffect } from 'react'

// Registra public/sw.js. Best-effort silencioso: un navegador sin service
// workers (o con ellos bloqueados) usa la app igual, solo que sin instalar.
export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  }, [])
  return null
}
