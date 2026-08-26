import { describe, expect, it } from 'vitest'
import { formatQuantity, normalizeSearchName, toBaseUnit, toDisplayUnit } from './quantities'
import type { FoodConversion } from './types'

const flour: FoodConversion = { defaultUnit: 'g', gramsPerCup: 120, gramsPerTbsp: 8, gramsPerUnit: null, densityGPerMl: null }
const sugar: FoodConversion = { defaultUnit: 'g', gramsPerCup: 200, gramsPerTbsp: 12.5, gramsPerUnit: null, densityGPerMl: null }
const onion: FoodConversion = { defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: 150, densityGPerMl: null }
const honey: FoodConversion = { defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: 1.42 }
const none: FoodConversion = { defaultUnit: null, gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null }

describe('formatQuantity', () => {
  it('masa y volumen sin decimales', () => {
    expect(formatQuantity(249.6, 'g', 'es')).toBe('250 g')
    expect(formatQuantity(0.4, 'ml', 'es')).toBe('0 ml')
  })
  it('≥10 entero', () => expect(formatQuantity(12.4, 'cup', 'es')).toBe('12 tazas'))
  it('kg, l, oz, lb con un decimal, sin fracciones', () => {
    expect(formatQuantity(1.5, 'l', 'es')).toBe('1,5 l')
    expect(formatQuantity(2, 'kg', 'es')).toBe('2 kg')
    expect(formatQuantity(0.75, 'lb', 'en')).toBe('0.8 lb')
  })
  it('fracciones bonitas', () => {
    expect(formatQuantity(0.5, 'tsp', 'es')).toBe('½ cdta')
    expect(formatQuantity(1.5, 'tsp', 'es')).toBe('1 ½ cdtas')
    expect(formatQuantity(0.33, 'cup', 'en')).toBe('⅓ cup')
    expect(formatQuantity(2.75, 'cup', 'en')).toBe('2 ¾ cups')
    expect(formatQuantity(0.25, 'cup', 'es')).toBe('¼ taza')
  })
  it('un decimal con coma si no hay fracción cercana', () => {
    expect(formatQuantity(1.4, 'tbsp', 'es')).toBe('1,4 cdas')
    expect(formatQuantity(1.4, 'tbsp', 'en')).toBe('1.4 tbsp')
  })
  it('redondeo a entero no deja decimal sobrante', () => {
    expect(formatQuantity(0.95, 'tsp', 'es')).toBe('1 cdta')
    expect(formatQuantity(1.95, 'tbsp', 'es')).toBe('2 cdas')
    expect(formatQuantity(1.96, 'tsp', 'en')).toBe('2 tsp')
  })
  it('null → cadena vacía; sin unidad → solo número', () => {
    expect(formatQuantity(null, 'g', 'es')).toBe('')
    expect(formatQuantity(3, null, 'es')).toBe('3')
  })
  it('unidad de recuento en singular y plural', () => {
    expect(formatQuantity(1, 'clove', 'es')).toBe('1 diente')
    expect(formatQuantity(2, 'clove', 'en')).toBe('2 cloves')
  })
})

describe('toBaseUnit', () => {
  it('unidades directas', () => {
    expect(toBaseUnit(1.5, 'kg', 'es')).toEqual({ qty: 1500, unit: 'g' })
    expect(toBaseUnit(2, 'l', 'en')).toEqual({ qty: 2000, unit: 'ml' })
    expect(toBaseUnit(3, 'ud', 'es')).toEqual({ qty: 3, unit: 'ud' })
    expect(toBaseUnit(1, 'oz', 'en')?.qty).toBeCloseTo(28.35)
    expect(toBaseUnit(1, 'cl', 'es')).toEqual({ qty: 10, unit: 'ml' })
  })
  it('taza es por alimento: harina ≠ azúcar', () => {
    expect(toBaseUnit(1, 'cup', 'es', flour)).toEqual({ qty: 120, unit: 'g' })
    expect(toBaseUnit(1, 'cup', 'es', sugar)).toEqual({ qty: 200, unit: 'g' })
    expect(toBaseUnit(2, 'tbsp', 'es', flour)).toEqual({ qty: 16, unit: 'g' })
    expect(toBaseUnit(3, 'tsp', 'es', flour)).toEqual({ qty: 8, unit: 'g' }) // tsp = tbsp/3
  })
  it('taza sin dato del alimento → volumen en ml', () => {
    expect(toBaseUnit(1, 'cup', 'es', none)).toEqual({ qty: 240, unit: 'ml' })
    expect(toBaseUnit(1, 'cup', 'es')).toEqual({ qty: 240, unit: 'ml' })
  })
  it('piezas con gramos por unidad → g; sin dato → ud', () => {
    expect(toBaseUnit(2, 'ud', 'es', onion)).toEqual({ qty: 300, unit: 'g' })
    expect(toBaseUnit(2, 'ud', 'es', none)).toEqual({ qty: 2, unit: 'ud' })
  })
  it('volumen con densidad y alimento por masa → g', () => {
    expect(toBaseUnit(1, 'tbsp', 'es', honey)?.qty).toBeCloseTo(21.3)
    expect(toBaseUnit(1, 'tbsp', 'es', honey)?.unit).toBe('g')
  })
  it('no convertible → null', () => {
    expect(toBaseUnit(1, 'pinch', 'es')).toBeNull()
    expect(toBaseUnit(2, 'clove', 'es')).toBeNull()
    expect(toBaseUnit(2, 'pechuga', 'es')).toBeNull()
  })
})

describe('toDisplayUnit', () => {
  it('métrico sube a kg/l a partir de 1000', () => {
    expect(toDisplayUnit(1500, 'g', null, 'metric')).toEqual({ quantity: 1.5, unit: 'kg' })
    expect(toDisplayUnit(250, 'ml', null, 'metric')).toEqual({ quantity: 250, unit: 'ml' })
  })
  it('imperial convierte masa y volumen', () => {
    expect(toDisplayUnit(453.6, 'g', null, 'imperial')).toEqual({ quantity: 1, unit: 'lb' })
    expect(toDisplayUnit(100, 'g', null, 'imperial').unit).toBe('oz')
    expect(toDisplayUnit(240, 'ml', null, 'imperial')).toEqual({ quantity: 1, unit: 'cup' })
  })
  it('unidad preferida por alimento', () => {
    expect(toDisplayUnit(240, 'g', flour, 'metric', 'cup')).toEqual({ quantity: 2, unit: 'cup' })
    expect(toDisplayUnit(300, 'g', onion, 'metric', 'ud')).toEqual({ quantity: 2, unit: 'ud' })
    expect(toDisplayUnit(300, 'g', none, 'metric', 'cup')).toEqual({ quantity: 300, unit: 'g' }) // sin dato, no inventa
  })
  it('ud se queda en ud', () => expect(toDisplayUnit(3, 'ud', null, 'imperial')).toEqual({ quantity: 3, unit: 'ud' }))
})

describe('normalizeSearchName', () => {
  it('quita acentos, mayúsculas y espacios repetidos', () => {
    expect(normalizeSearchName('  Pimentón  Dulce ')).toBe('pimenton dulce')
  })
})
