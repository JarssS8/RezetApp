import { describe, expect, it } from 'vitest'
import { allocateDeductions, entryStatus, expiringSoon } from './pantry'
import type { PantryItem } from './types'

const item = (id: string, qty: number, over: Partial<PantryItem> = {}): PantryItem => ({
  id, foodId: 'f', quantity: qty, unit: 'g', expiresAt: null, addedAt: new Date('2026-01-01'), conversion: null, ...over,
})

describe('allocateDeductions', () => {
  it('FIFO por caducidad, nulls al final, luego added_at', () => {
    const items = [
      item('sin-fecha', 100, { addedAt: new Date('2025-12-01') }),
      item('tarde', 100, { expiresAt: new Date('2026-03-01') }),
      item('pronto', 100, { expiresAt: new Date('2026-02-01') }),
      item('sin-fecha-nuevo', 100, { addedAt: new Date('2026-01-15') }),
    ]
    const r = allocateDeductions(items, [{ foodId: 'f', quantity: 250, unit: 'g' }])
    expect(r.allocations.map((a) => [a.pantryItemId, a.quantity])).toEqual([['pronto', 100], ['tarde', 100], ['sin-fecha', 50]])
    expect(r.unmatched).toEqual([])
  })
  it('falta de existencias → asigna lo que hay y deja el resto en unmatched', () => {
    const r = allocateDeductions([item('a', 30)], [{ foodId: 'f', quantity: 100, unit: 'g' }])
    expect(r.allocations).toEqual([{ pantryItemId: 'a', foodId: 'f', quantity: 30 }])
    expect(r.unmatched).toEqual([{ foodId: 'f', quantity: 70, unit: 'g' }])
  })
  it('alimento sin ítems → todo unmatched', () => {
    const r = allocateDeductions([], [{ foodId: 'x', quantity: 5, unit: 'ud' }])
    expect(r.unmatched).toEqual([{ foodId: 'x', quantity: 5, unit: 'ud' }])
  })
  it('ignora ítems con otra unidad base', () => {
    const r = allocateDeductions([item('ml', 500, { unit: 'ml' })], [{ foodId: 'f', quantity: 100, unit: 'g' }])
    expect(r.allocations).toEqual([])
    expect(r.unmatched[0]?.quantity).toBe(100)
  })
  it('no asigna cantidades cero ni toca ítems a 0', () => {
    const r = allocateDeductions([item('vacio', 0), item('lleno', 50)], [{ foodId: 'f', quantity: 20, unit: 'g' }])
    expect(r.allocations).toEqual([{ pantryItemId: 'lleno', foodId: 'f', quantity: 20 }])
  })
  it('es puro: no muta la entrada', () => {
    const items = [item('a', 100)]
    allocateDeductions(items, [{ foodId: 'f', quantity: 40, unit: 'g' }])
    expect(items[0]?.quantity).toBe(100)
  })
})

describe('expiringSoon', () => {
  it('incluye lo que caduca en ≤ days (incluido hoy y ya caducado), ordenado', () => {
    const today = new Date('2026-08-26')
    const items = [
      item('a', 1, { expiresAt: new Date('2026-08-30') }),
      item('b', 1, { expiresAt: new Date('2026-08-20') }),
      item('c', 1, { expiresAt: new Date('2026-09-10') }),
      item('d', 1),
      item('e', 1, { expiresAt: new Date('2026-08-26') }),
    ]
    expect(expiringSoon(items, today, 3).map((i) => i.id)).toEqual(['b', 'e'])
    expect(expiringSoon(items, today, 7).map((i) => i.id)).toEqual(['b', 'e', 'a'])
  })
})

describe('entryStatus', () => {
  it('cooked gana a skipped; sin fechas → planned', () => {
    expect(entryStatus({ cookedAt: new Date(), skippedAt: new Date() })).toBe('cooked')
    expect(entryStatus({ cookedAt: null, skippedAt: new Date() })).toBe('skipped')
    expect(entryStatus({ cookedAt: null, skippedAt: null })).toBe('planned')
  })
})
