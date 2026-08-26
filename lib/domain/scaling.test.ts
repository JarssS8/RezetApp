import { describe, expect, it } from 'vitest'
import { isNonLinearByDefault, scaleIngredient, scaleQuantity, scaleRecipe } from './scaling'
import type { Ingredient } from './types'

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: 'i1', foodId: 'f1', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g',
  preparation: null, groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, ...over,
})

describe('scaleQuantity', () => {
  it('lineal multiplica', () => expect(scaleQuantity(100, 2, true)).toBe(200))
  it('no lineal amortigua con ratio^0.65', () => expect(scaleQuantity(10, 2, false)).toBeCloseTo(15.69, 2))
  it('ratio 1 no cambia nada', () => {
    expect(scaleQuantity(7, 1, false)).toBe(7)
    expect(scaleQuantity(7, 1, true)).toBe(7)
  })
  it('reducir también amortigua', () => expect(scaleQuantity(10, 0.5, false)).toBeCloseTo(6.37, 2))
})

describe('scaleIngredient', () => {
  it('escala base y display con la misma regla', () => {
    const r = scaleIngredient(ing({ quantity: 15, unit: 'ml', displayQuantity: 1, displayUnit: 'tbsp', scalesLinearly: false }), 2)
    expect(r.quantity).toBeCloseTo(23.54, 2)
    expect(r.displayQuantity).toBeCloseTo(1.57, 2)
  })
  it('null se queda null', () => {
    const r = scaleIngredient(ing({ quantity: null, unit: null, displayQuantity: null, displayUnit: 'pinch' }), 3)
    expect(r.quantity).toBeNull()
    expect(r.displayQuantity).toBeNull()
  })
})

describe('scaleRecipe', () => {
  it('calcula ratio y lista los no lineales', () => {
    const r = scaleRecipe({ servingsBase: 4, ingredients: [ing({ id: 'a' }), ing({ id: 'b', scalesLinearly: false, quantity: 5 })] }, 6)
    expect(r.ratio).toBe(1.5)
    expect(r.servings).toBe(6)
    expect(r.ingredients[0]?.quantity).toBe(150)
    expect(r.ingredients[1]?.quantity).toBeCloseTo(6.5, 1)
    expect(r.nonLinearIds).toEqual(['b'])
  })
  it('rechaza raciones no positivas', () => {
    expect(() => scaleRecipe({ servingsBase: 4, ingredients: [] }, 0)).toThrow()
  })
})

describe('isNonLinearByDefault', () => {
  it('detecta sal, especias, levadura y alcohol en español', () => {
    for (const n of ['sal', 'sal gruesa', 'pimienta negra', 'comino', 'levadura química', 'vino blanco', 'bicarbonato', 'esencia de vainilla', 'gelatina', 'orégano'])
      expect(isNonLinearByDefault(n, 'es'), n).toBe(true)
  })
  it('detecta en inglés', () => {
    for (const n of ['salt', 'baking powder', 'yeast', 'black pepper', 'white wine', 'vanilla extract']) expect(isNonLinearByDefault(n, 'en'), n).toBe(true)
  })
  it('ingredientes normales son lineales', () => {
    for (const n of ['harina', 'cebolla', 'pollo', 'aceite de oliva', 'flour', 'chicken']) expect(isNonLinearByDefault(n, 'es'), n).toBe(false)
  })
})
