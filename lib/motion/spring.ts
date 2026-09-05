// Puerto 1:1 de design_handoff_rezet_redesign/motion.js: el integrador de
// muelle, la proyección de momento y el rubber-banding de la hoja inferior
// arrastrable. Sin dependencias — igual que el original. Consumido por el
// componente de hoja inferior de la Fase 2 (README §6.3-6.4).

export type SpringState = { x: number; v: number }

// Constantes exactas del handoff (README §6.3): rigidez k=190, amortiguación
// c=27 — críticamente amortiguado, sin rebote. NO son aproximaciones.
export const SPRING_K = 190
export const SPRING_C = 27
export const SPRING_DT_MAX = 0.032
export const SPRING_STOP_DX = 0.6
export const SPRING_STOP_DV = 14

// Un paso del integrador, por frame. Se anima siempre desde el x/v actuales
// en pantalla, nunca desde el valor lógico ni reiniciando v a 0 (README
// §6.3): por eso recibe `state` completo y lo devuelve completo, en vez de
// llevar estado interno propio.
export function stepSpring(state: SpringState, to: number, dtSeconds: number): SpringState {
  const dt = Math.min(SPRING_DT_MAX, dtSeconds)
  const v = state.v + (-SPRING_K * (state.x - to) - SPRING_C * state.v) * dt
  const x = state.x + v * dt
  return { x, v }
}

export function isSpringSettled(state: SpringState, to: number): boolean {
  return Math.abs(state.x - to) < SPRING_STOP_DX && Math.abs(state.v) < SPRING_STOP_DV
}

// Rubber-banding del arrastre de la hoja inferior (README §6.4 paso 2): solo
// al arrastrar hacia arriba (dy negativo) se amortigua al 25%; hacia abajo
// sigue el dedo 1:1.
export const RUBBER_BAND_FACTOR = 0.25

export function applyRubberBand(dy: number, factor: number = RUBBER_BAND_FACTOR): number {
  return dy < 0 ? dy * factor : dy
}

// Proyección de momento de Apple (README §6.4 paso 4): dónde acabaría la hoja
// si soltase el dedo ahora mismo y siguiera decayendo con esta velocidad,
// no la distancia ya recorrida.
export const MOMENTUM_DECAY = 0.998

export function projectMomentum(y: number, velocityPxPerSec: number, decay: number = MOMENTUM_DECAY): number {
  return y + ((velocityPxPerSec / 1000) * decay) / (1 - decay)
}
