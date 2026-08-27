'use client'

// Dos pitidos cortos sintetizados y una vibración. Sin fichero de audio: no
// hay nada que descargar, nada que cachear en el service worker y nada que
// falle sin red. Best-effort silencioso, como el wake lock (spec §8): un
// navegador sin WebAudio o sin permiso de sonido sigue cocinando igual.
const BEEP_HZ = 880
const BEEP_MS = 180
const GAP_MS = 120

export function playAlarm(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.AudioContext === 'function') {
      const audio = new window.AudioContext()
      for (const index of [0, 1]) {
        const at = audio.currentTime + (index * (BEEP_MS + GAP_MS)) / 1000
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        osc.frequency.value = BEEP_HZ
        // Rampa de salida: un corte seco produce un chasquido desagradable.
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + BEEP_MS / 1000)
        osc.connect(gain).connect(audio.destination)
        osc.start(at)
        osc.stop(at + BEEP_MS / 1000)
      }
      setTimeout(() => void audio.close().catch(() => undefined), 2 * (BEEP_MS + GAP_MS) + 200)
    }
  } catch {
    // sin sonido: se cocina igual
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200])
  } catch {
    // sin vibración: se cocina igual
  }
}
