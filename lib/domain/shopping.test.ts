import { describe, expect, it } from 'vitest'
import { consolidateNeeds, toShopListItem } from './shopping'
import type { PantryItem, PlannedEntry, ShoppingIngredient } from './types'

const ing = (over: Partial<ShoppingIngredient>): ShoppingIngredient => ({
  id: 'i', foodId: 'harina', foodName: 'Harina', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g',
  preparation: null, groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, ...over,
})
const entry = (over: Partial<PlannedEntry>, ingredients: ShoppingIngredient[]): PlannedEntry => ({
  id: 'e', servings: 2, leftoverOfEntryId: null, cookedAt: null, skippedAt: null, recipe: { servingsBase: 2, ingredients }, ...over,
})
const pantry = (foodId: string, qty: number, unit: PantryItem['unit'] = 'g'): PantryItem => ({ id: `p-${foodId}`, foodId, quantity: qty, unit, expiresAt: null, addedAt: new Date() })

describe('consolidateNeeds', () => {
  it('escala a las raciones del hueco, agrupa por alimento y resta despensa', () => {
    const lines = consolidateNeeds(
      [entry({ id: 'a', servings: 4 }, [ing({})]), entry({ id: 'b', servings: 2 }, [ing({ id: 'k' })])],
      [pantry('harina', 50)],
    )
    expect(lines).toEqual([{ foodId: 'harina', name: 'Harina', quantity: 250, unit: 'g', unresolved: false }])
  })
  it('descarta lo que la despensa cubre', () => {
    expect(consolidateNeeds([entry({}, [ing({})])], [pantry('harina', 500)])).toEqual([])
  })
  it('excluye sobras, cocinadas y saltadas', () => {
    const lines = consolidateNeeds(
      [
        entry({ id: 's', leftoverOfEntryId: 'x' }, [ing({})]),
        entry({ id: 'c', cookedAt: new Date() }, [ing({})]),
        entry({ id: 'k', skippedAt: new Date() }, [ing({})]),
        entry({ id: 'ok' }, [ing({})]),
      ],
      [],
    )
    expect(lines).toEqual([{ foodId: 'harina', name: 'Harina', quantity: 100, unit: 'g', unresolved: false }])
  })
  it('no lineal se escala amortiguado', () => {
    const lines = consolidateNeeds([entry({ servings: 4 }, [ing({ foodId: 'sal', foodName: 'Sal', quantity: 10, scalesLinearly: false })])], [])
    expect(lines[0]?.quantity).toBeCloseTo(15.69, 2)
  })
  it('sin food_id: agrupa por nombre normalizado, suma y no resta despensa', () => {
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: null, foodName: 'Queso Feta', quantity: 100 }), ing({ id: 'z', foodId: null, foodName: 'queso feta', quantity: 50 })])],
      [pantry('queso-feta', 1000)],
    )
    expect(lines).toEqual([{ foodId: null, name: 'Queso Feta', quantity: 150, unit: 'g', unresolved: true }])
  })
  it('sin base: una línea sin cantidad, sin duplicar', () => {
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: 'pimienta', foodName: 'Pimienta', quantity: null, unit: null, displayUnit: 'pinch' }), ing({ id: 'q', foodId: 'pimienta', foodName: 'Pimienta', quantity: null, unit: null })])],
      [pantry('pimienta', 100)],
    )
    expect(lines).toEqual([{ foodId: 'pimienta', name: 'Pimienta', quantity: null, unit: null, unresolved: false }])
  })
  it('mismo alimento en g y ml son líneas distintas', () => {
    const lines = consolidateNeeds([entry({}, [ing({ foodId: 'leche', foodName: 'Leche', unit: 'ml' }), ing({ id: 'g', foodId: 'leche', foodName: 'Leche', unit: 'g' })])], [])
    expect(lines).toHaveLength(2)
  })
  it('orden estable por nombre', () => {
    const lines = consolidateNeeds([entry({}, [ing({ foodId: 'z', foodName: 'Zanahoria' }), ing({ id: 'b', foodId: 'a', foodName: 'Ajo' })])], [])
    expect(lines.map((l) => l.name)).toEqual(['Ajo', 'Zanahoria'])
  })
})

describe('toShopListItem', () => {
  it('piezas → quantity entera; masa/volumen → unidad en el nombre; sin cantidad → solo nombre', () => {
    expect(toShopListItem({ foodId: 'h', name: 'Huevos', quantity: 5.2, unit: 'ud', unresolved: false })).toEqual({ name: 'Huevos', quantity: 6 })
    expect(toShopListItem({ foodId: 'l', name: 'Lentejas pardinas', quantity: 300, unit: 'g', unresolved: false })).toEqual({ name: 'Lentejas pardinas · 300 g', quantity: null })
    expect(toShopListItem({ foodId: 'l', name: 'Leche', quantity: 1500, unit: 'ml', unresolved: false })).toEqual({ name: 'Leche · 1,5 l', quantity: null })
    expect(toShopListItem({ foodId: 'p', name: 'Pimienta', quantity: null, unit: null, unresolved: false })).toEqual({ name: 'Pimienta', quantity: null })
  })
})
