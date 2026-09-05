import { describe, expect, it } from 'vitest'
import {
  applyRubberBand,
  isSpringSettled,
  projectMomentum,
  SPRING_C,
  SPRING_K,
  stepSpring,
} from './spring'

describe('stepSpring', () => {
  it('converge al destino sin overshoot (críticamente amortiguado)', () => {
    let state = { x: 0, v: 0 }
    let maxX = 0
    for (let i = 0; i < 200; i++) {
      state = stepSpring(state, 100, 1 / 60)
      maxX = Math.max(maxX, state.x)
    }
    expect(state.x).toBeCloseTo(100, 0)
    // Críticamente amortiguado: nunca se pasa del destino.
    expect(maxX).toBeLessThanOrEqual(100.5)
  })

  it('se detiene cuando |x-to|<0.6 y |v|<14, no antes', () => {
    // Un paso desde muy cerca del destino y con velocidad baja debe asentar.
    const settled = stepSpring({ x: 99.8, v: 5 }, 100, 1 / 60)
    expect(isSpringSettled(settled, 100)).toBe(true)
    // Lejos del destino, no asienta.
    expect(isSpringSettled({ x: 50, v: 0 }, 100)).toBe(false)
  })

  it('limita dt a 32ms aunque se le pase un salto de frame más largo', () => {
    const withCap = stepSpring({ x: 0, v: 0 }, 100, 0.032)
    const withLongerFrame = stepSpring({ x: 0, v: 0 }, 100, 0.5)
    expect(withLongerFrame).toEqual(withCap)
  })

  it('usa las constantes exactas k=190, c=27', () => {
    expect(SPRING_K).toBe(190)
    expect(SPRING_C).toBe(27)
  })

  it('parte siempre del x y v actuales, nunca reinicia la velocidad', () => {
    const withMomentum = stepSpring({ x: 50, v: 800 }, 100, 1 / 60)
    const withoutMomentum = stepSpring({ x: 50, v: 0 }, 100, 1 / 60)
    expect(withMomentum.x).not.toBeCloseTo(withoutMomentum.x, 2)
  })
})

describe('applyRubberBand', () => {
  it('amortigua al 25% cuando se arrastra hacia arriba (dy negativo)', () => {
    expect(applyRubberBand(-40)).toBeCloseTo(-10, 6)
  })
  it('sigue 1:1 cuando se arrastra hacia abajo (dy positivo)', () => {
    expect(applyRubberBand(40)).toBe(40)
  })
  it('en dy=0 no cambia nada', () => {
    expect(applyRubberBand(0)).toBe(0)
  })
})

describe('projectMomentum', () => {
  it('reproduce la fórmula de proyección de Apple con decay 0.998', () => {
    // y=0, velocidad=500px/s → 0 + (500/1000)*0.998/(1-0.998) = 249.5
    expect(projectMomentum(0, 500)).toBeCloseTo(249.5, 1)
  })
  it('con velocidad 0 no proyecta nada', () => {
    expect(projectMomentum(80, 0)).toBe(80)
  })
  it('con velocidad negativa proyecta hacia atrás', () => {
    expect(projectMomentum(200, -1000)).toBeLessThan(200)
  })
})
