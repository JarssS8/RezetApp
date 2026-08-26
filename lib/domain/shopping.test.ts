import { describe, expect, it } from 'vitest'
import { consolidateNeeds, convertBase, toShopListItem } from './shopping'
import type { FoodConversion, PantryItem, PlannedEntry, ShoppingIngredient, ShoppingLine } from './types'

const conv = (over: Partial<FoodConversion>): FoodConversion => ({ defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null, ...over })
const ing = (over: Partial<ShoppingIngredient>): ShoppingIngredient => ({
  id: 'i', foodId: 'harina', foodName: 'Harina', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g',
  preparation: null, groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, conversion: null, ...over,
})
const entry = (over: Partial<PlannedEntry>, ingredients: ShoppingIngredient[]): PlannedEntry => ({
  id: 'e', servings: 2, leftoverOfEntryId: null, cookedAt: null, skippedAt: null, recipe: { servingsBase: 2, ingredients }, ...over,
})
const pantry = (foodId: string, qty: number, unit: PantryItem['unit'] = 'g', conversion: FoodConversion | null = null): PantryItem => ({
  id: `p-${foodId}`, foodId, quantity: qty, unit, expiresAt: null, addedAt: new Date(), conversion,
})
const line = (over: Partial<ShoppingLine>): ShoppingLine => ({ foodId: 'harina', name: 'Harina', quantity: 100, unit: 'g', unresolved: false, pantryUnmatched: false, ...over })

describe('convertBase', () => {
  it('misma unidad, densidad y piezas', () => {
    expect(convertBase(100, 'g', 'g', null)).toBe(100)
    expect(convertBase(100, 'ml', 'g', conv({ densityGPerMl: 1.03 }))).toBeCloseTo(103, 6)
    expect(convertBase(103, 'g', 'ml', conv({ densityGPerMl: 1.03 }))).toBeCloseTo(100, 6)
    expect(convertBase(3, 'ud', 'g', conv({ gramsPerUnit: 60 }))).toBe(180)
    expect(convertBase(180, 'g', 'ud', conv({ gramsPerUnit: 60 }))).toBe(3)
    expect(convertBase(2, 'ud', 'ml', conv({ gramsPerUnit: 60, densityGPerMl: 1.2 }))).toBe(100)
  })
  it('sin el dato necesario devuelve null', () => {
    expect(convertBase(100, 'ml', 'g', null)).toBeNull()
    expect(convertBase(2, 'ud', 'g', conv({}))).toBeNull()
    expect(convertBase(100, 'g', 'ml', conv({ gramsPerUnit: 60 }))).toBeNull()
    expect(convertBase(100, 'g', 'ud', conv({ densityGPerMl: 1 }))).toBeNull()
  })
})

describe('consolidateNeeds', () => {
  it('escala a las raciones del hueco, agrupa por alimento y resta despensa', () => {
    const lines = consolidateNeeds(
      [entry({ id: 'a', servings: 4 }, [ing({})]), entry({ id: 'b', servings: 2 }, [ing({ id: 'k' })])],
      [pantry('harina', 50)],
    )
    expect(lines).toEqual([line({ quantity: 250 })])
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
    expect(lines).toEqual([line({})])
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
    expect(lines).toEqual([line({ foodId: null, name: 'Queso Feta', quantity: 150, unresolved: true })])
  })
  it('sin base: una línea sin cantidad, sin duplicar', () => {
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: 'pimienta', foodName: 'Pimienta', quantity: null, unit: null, displayUnit: 'pinch' }), ing({ id: 'q', foodId: 'pimienta', foodName: 'Pimienta', quantity: null, unit: null })])],
      [pantry('pimienta', 100)],
    )
    expect(lines).toEqual([line({ foodId: 'pimienta', name: 'Pimienta', quantity: null, unit: null })])
  })
  it('mismo alimento en dos unidades base: se convierte y sale una sola línea', () => {
    const leche = conv({ defaultUnit: 'ml', densityGPerMl: 1.03 })
    const lines = consolidateNeeds(
      [entry({}, [
        ing({ foodId: 'leche', foodName: 'Leche', quantity: 200, unit: 'ml', conversion: leche }),
        ing({ id: 'g', foodId: 'leche', foodName: 'Leche', quantity: 103, unit: 'g', conversion: leche }),
      ])],
      [],
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.unit).toBe('ml')
    expect(lines[0]?.quantity).toBeCloseTo(300, 6)
  })
  it('sin conversión, dos unidades base del mismo alimento siguen siendo dos líneas', () => {
    const lines = consolidateNeeds([entry({}, [ing({ foodId: 'leche', foodName: 'Leche', unit: 'ml' }), ing({ id: 'g', foodId: 'leche', foodName: 'Leche', unit: 'g' })])], [])
    expect(lines).toHaveLength(2)
  })
  it('despensa en otra unidad: se convierte y se resta', () => {
    const huevo = conv({ gramsPerUnit: 60 })
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: 'huevo', foodName: 'Huevos', quantity: 300, unit: 'g', conversion: huevo })])],
      [pantry('huevo', 3, 'ud', huevo)],
    )
    expect(lines).toEqual([line({ foodId: 'huevo', name: 'Huevos', quantity: 120 })])
  })
  it('despensa sin conversión en otra unidad: ni se resta ni se ignora en silencio', () => {
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: 'huevo', foodName: 'Huevos', quantity: 300, unit: 'g' })])],
      [pantry('huevo', 3, 'ud')],
    )
    expect(lines).toEqual([line({ foodId: 'huevo', name: 'Huevos', quantity: 300, pantryUnmatched: true })])
  })
  it('orden estable por nombre', () => {
    const lines = consolidateNeeds([entry({}, [ing({ foodId: 'z', foodName: 'Zanahoria' }), ing({ id: 'b', foodId: 'a', foodName: 'Ajo' })])], [])
    expect(lines.map((l) => l.name)).toEqual(['Ajo', 'Zanahoria'])
  })
})

describe('toShopListItem', () => {
  it('piezas → quantity entera; masa/volumen → unidad en el nombre; sin cantidad → solo nombre', () => {
    expect(toShopListItem(line({ foodId: 'h', name: 'Huevos', quantity: 5.2, unit: 'ud' }))).toEqual({ name: 'Huevos', quantity: 6 })
    expect(toShopListItem(line({ foodId: 'l', name: 'Lentejas pardinas', quantity: 300 }))).toEqual({ name: 'Lentejas pardinas · 300 g', quantity: null })
    expect(toShopListItem(line({ foodId: 'l', name: 'Leche', quantity: 1500, unit: 'ml' }))).toEqual({ name: 'Leche · 1,5 l', quantity: null })
    expect(toShopListItem(line({ foodId: 'p', name: 'Pimienta', quantity: null, unit: null }))).toEqual({ name: 'Pimienta', quantity: null })
  })
})
