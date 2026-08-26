import { describe, expect, it } from 'vitest'
import { addDays, monthRange, todayIso, weekRange } from './plan-dates'

describe('weekRange', () => {
  it('usa el lunes como inicio de semana por defecto', () => {
    // 2026-08-26 es miércoles
    const r = weekRange('2026-08-26')
    expect(r.from).toBe('2026-08-24')
    expect(r.to).toBe('2026-08-30')
    expect(r.days).toEqual(['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'])
  })

  it('si la fecha ya es lunes, empieza en ella misma', () => {
    const r = weekRange('2026-08-24')
    expect(r.from).toBe('2026-08-24')
    expect(r.days[0]).toBe('2026-08-24')
  })

  it('si la fecha es domingo, la semana empieza el lunes anterior', () => {
    const r = weekRange('2026-08-30')
    expect(r.from).toBe('2026-08-24')
    expect(r.to).toBe('2026-08-30')
  })

  it('cruza de mes correctamente', () => {
    // 2026-03-01 es domingo -> semana empieza 2026-02-23
    const r = weekRange('2026-03-01')
    expect(r.from).toBe('2026-02-23')
    expect(r.to).toBe('2026-03-01')
  })

  it('cruza de año correctamente', () => {
    // 2026-01-01 es jueves -> semana empieza 2025-12-29
    const r = weekRange('2026-01-01')
    expect(r.from).toBe('2025-12-29')
    expect(r.to).toBe('2026-01-04')
  })

  it('admite weekStartsOn = 0 (domingo)', () => {
    const r = weekRange('2026-08-26', 0)
    expect(r.from).toBe('2026-08-23')
    expect(r.to).toBe('2026-08-29')
  })
})

describe('addDays', () => {
  it('suma días dentro del mismo mes', () => {
    expect(addDays('2026-08-24', 3)).toBe('2026-08-27')
  })

  it('cruza de mes', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02')
  })

  it('cruza de año', () => {
    expect(addDays('2025-12-30', 3)).toBe('2026-01-02')
  })

  it('admite números negativos', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('monthRange', () => {
  it('devuelve el primer y último día del mes', () => {
    const r = monthRange('2026-02-14')
    expect(r.from).toBe('2026-02-01')
    expect(r.to).toBe('2026-02-28')
  })

  it('respeta años bisiestos', () => {
    const r = monthRange('2028-02-10')
    expect(r.from).toBe('2028-02-01')
    expect(r.to).toBe('2028-02-29')
  })

  it('meses de 31 días', () => {
    const r = monthRange('2026-01-15')
    expect(r.from).toBe('2026-01-01')
    expect(r.to).toBe('2026-01-31')
  })
})

describe('todayIso', () => {
  it('devuelve una fecha con formato YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('acepta una zona horaria distinta', () => {
    expect(todayIso('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
