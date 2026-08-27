'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Locale } from '@/lib/domain/types'

export interface SpeechApi {
  supported: boolean
  speaking: boolean
  speak: (text: string) => void
  stop: () => void
}

// La disponibilidad de la API no cambia en la vida del componente: no hace
// falta suscribirse a nada real.
function subscribeNever(): () => void {
  return () => undefined
}

function getSupportedSnapshot(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

// En SSR no hay `window`: el snapshot del servidor es fijo en false para que
// no haya desajuste de hidratación con lo que calcula el cliente.
function getSupportedServerSnapshot(): boolean {
  return false
}

// Lectura en voz alta del paso (spec §8, "voz en fase 5"). Todo ocurre en el
// navegador: sin red, sin proveedor y sin telemetría. Igual que el wake lock,
// si la API no está el resto sigue funcionando: `supported` en false y la
// interfaz no pinta el botón.
export function useSpeech(locale: Locale): SpeechApi {
  // useSyncExternalStore en vez de useState+useEffect: evita el mismo
  // desajuste de hidratación sin llamar a setState desde un efecto.
  const supported = useSyncExternalStore(subscribeNever, getSupportedSnapshot, getSupportedServerSnapshot)
  const [speaking, setSpeaking] = useState(false)

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return
      // Cancelar antes de hablar: sin esto, dos pasos seguidos se encolan y la
      // cocina oye el paso anterior mientras mira el siguiente.
      window.speechSynthesis.cancel()
      const utterance = new window.SpeechSynthesisUtterance(text)
      utterance.lang = locale
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
      setSpeaking(true)
    },
    [locale],
  )

  // Salir del modo cocina no debe dejar una voz hablando sola.
  useEffect(() => stop, [stop])

  return { supported, speaking, speak, stop }
}
