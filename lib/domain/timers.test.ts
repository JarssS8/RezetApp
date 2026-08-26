import { describe, expect, it } from 'vitest'
import { detectTimers } from './timers'

describe('detectTimers', () => {
  it('minutos en español', () => {
    expect(detectTimers('Hornea 25 minutos a 180 ºC', 'es')).toEqual([{ start: 7, end: 17, seconds: 1500 }])
  })
  it('varias unidades y formas', () => {
    const r = detectTimers('Cuece 1 hora y deja reposar 10 min. Remueve cada 30 segundos.', 'es')
    expect(r.map((t) => t.seconds)).toEqual([3600, 600, 30])
  })
  it('rango usa el valor menor', () => {
    expect(detectTimers('Sofríe 8-10 minutos', 'es')[0]?.seconds).toBe(480)
    expect(detectTimers('Simmer for 20 to 25 minutes', 'en')[0]?.seconds).toBe(1200)
  })
  it('inglés con h/hr/mins/secs', () => {
    const r = detectTimers('Bake 1 hr, then rest 5 mins and whisk 45 secs', 'en')
    expect(r.map((t) => t.seconds)).toEqual([3600, 300, 45])
  })
  it('media hora y hora y media', () => {
    expect(detectTimers('Deja reposar media hora', 'es')[0]?.seconds).toBe(1800)
    expect(detectTimers('Cocina 1 hora y media', 'es')[0]?.seconds).toBe(5400)
  })
  it('ignora temperaturas y cantidades', () => {
    expect(detectTimers('Añade 200 g y 180 ºC', 'es')).toEqual([])
  })
  it('fusiona duraciones compuestas contiguas', () => {
    expect(detectTimers('deja reposar 1 h 30 min', 'es')).toEqual([{ start: 13, end: 23, seconds: 5400 }])
    expect(detectTimers('2 horas y 15 minutos', 'es')[0]).toMatchObject({ seconds: 8100 })
    expect(detectTimers('2 horas y 15 minutos', 'es').length).toBe(1)
    expect(detectTimers('Bake 1 hour 30 minutes', 'en')).toEqual([{ start: 5, end: 22, seconds: 5400 }])
  })
  it('no fusiona duraciones separadas por otras palabras', () => {
    const r = detectTimers('5 minutos y luego otros 5 minutos', 'es')
    expect(r.map((t) => t.seconds)).toEqual([300, 300])
  })
  it('rango usa el menor aunque el primero sea mayor', () => {
    expect(detectTimers('10-8 minutos', 'es')[0]?.seconds).toBe(480)
  })
})
