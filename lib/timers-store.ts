import { create } from 'zustand'

// Por qué un store de módulo y no useState (W9): los temporizadores de
// cocina tienen que sobrevivir tanto a navegar a otra pantalla (Hoy, Plan…)
// como al remontaje del paso actual dentro de la propia sesión de cocina (la
// `key` de la animación de entrada en cook-session.tsx remonta StepTimers a
// cada paso). Un estado de React muere con el componente que lo declara; uno
// en un store fuera de React, no — sigue vivo mientras la pestaña lo esté.
export interface TimerState {
  id: string
  label: string
  totalSeconds: number
  running: boolean
  endsAt: number | null // epoch ms; solo tiene sentido mientras running (reloj de pared, no ticks)
  pausedRemaining: number // segundos que quedaban la última vez que se paró (pausa, fin, o recién creado)
}

interface TimersStoreState {
  // Las sesiones se namespacen por receta/entrada del plan (sessionKey de
  // use-timers.ts): dos sesiones de cocina no deben compartir temporizadores
  // aunque coincida el id de tramo detectado (mismo stepIndex en dos recetas
  // distintas).
  sessions: Record<string, Record<string, TimerState>>
  start: (sessionKey: string, id: string, seconds: number, label: string) => void
  toggle: (sessionKey: string, id: string) => void
  reset: (sessionKey: string, id: string) => void
  dismiss: (sessionKey: string, id: string) => void
  // Recalcula desde el reloj de pared y para los que hayan llegado a cero;
  // devuelve solo los que acaban de terminar EN ESTA llamada, para que quien
  // la invoque (use-timers.ts) avise una sola vez por temporizador.
  tick: (at: number) => TimerState[]
}

export function remainingOf(t: TimerState, now: number): number {
  if (!t.running || t.endsAt === null) return t.pausedRemaining
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000))
}

export const useTimersStore = create<TimersStoreState>()((set) => ({
  sessions: {},
  start: (sessionKey, id, seconds, label) =>
    set((state) => {
      const timer: TimerState = { id, label, totalSeconds: seconds, running: true, endsAt: Date.now() + seconds * 1000, pausedRemaining: seconds }
      return { sessions: { ...state.sessions, [sessionKey]: { ...state.sessions[sessionKey], [id]: timer } } }
    }),
  toggle: (sessionKey, id) =>
    set((state) => {
      const session = state.sessions[sessionKey]
      const timer = session?.[id]
      if (!timer) return state
      const remaining = remainingOf(timer, Date.now())
      if (remaining === 0) return state
      const next: TimerState = timer.running
        ? { ...timer, running: false, endsAt: null, pausedRemaining: remaining }
        : { ...timer, running: true, endsAt: Date.now() + remaining * 1000 }
      return { sessions: { ...state.sessions, [sessionKey]: { ...session, [id]: next } } }
    }),
  reset: (sessionKey, id) =>
    set((state) => {
      const session = state.sessions[sessionKey]
      const timer = session?.[id]
      if (!timer) return state
      return { sessions: { ...state.sessions, [sessionKey]: { ...session, [id]: { ...timer, running: false, endsAt: null, pausedRemaining: timer.totalSeconds } } } }
    }),
  dismiss: (sessionKey, id) =>
    set((state) => {
      const session = state.sessions[sessionKey]
      if (!session || !(id in session)) return state
      const rest = { ...session }
      delete rest[id]
      // Poda: una sesión sin temporizadores no deja un objeto vacío colgado
      // para siempre en el mapa (revisión W9, hallazgo 2).
      if (Object.keys(rest).length === 0) {
        const sessions = { ...state.sessions }
        delete sessions[sessionKey]
        return { sessions }
      }
      return { sessions: { ...state.sessions, [sessionKey]: rest } }
    }),
  tick: (at) => {
    const finished: TimerState[] = []
    set((state) => {
      let changed = false
      const sessions = { ...state.sessions }
      for (const [sessionKey, timers] of Object.entries(state.sessions)) {
        let sessionChanged = false
        const nextTimers = { ...timers }
        for (const [id, timer] of Object.entries(timers)) {
          if (!timer.running || remainingOf(timer, at) > 0) continue
          const stopped: TimerState = { ...timer, running: false, endsAt: null, pausedRemaining: 0 }
          nextTimers[id] = stopped
          finished.push(stopped)
          sessionChanged = true
        }
        if (sessionChanged) {
          sessions[sessionKey] = nextTimers
          changed = true
        }
      }
      return changed ? { sessions } : state
    })
    return finished
  },
}))

// Solo para tests: al vivir fuera de React, el store no se limpia solo entre
// casos (a diferencia del DOM, que sí limpia vitest.setup.ts). Sin el
// segundo argumento (replace): un `true` ahí sustituiría el estado entero y
// se llevaría por delante start/toggle/reset/dismiss/tick.
export function resetTimersStore(): void {
  useTimersStore.setState({ sessions: {} })
}
