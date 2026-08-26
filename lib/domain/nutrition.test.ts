import { describe, expect, it } from 'vitest'
import { aggregateNutrition, recipeNutrition } from './nutrition'
import { scaleRecipe } from './scaling'
import type { FoodNutrition, IngredientWithFood } from './types'

const food = (over: Partial<FoodNutrition>): FoodNutrition => ({
  defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null,
  kcal100g: 100, protein100g: 10, carbs100g: 10, fat100g: 1, fiber100g: 1, isEstimated: false, ...over,
})
const ing = (over: Partial<IngredientWithFood>): IngredientWithFood => ({
  id: 'i', foodId: 'f', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g', preparation: null,
  groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, food: food({}), ...over,
})

describe('recipeNutrition', () => {
  it('suma por gramos y reparte por ración', () => {
    const n = recipeNutrition([ing({ quantity: 200 }), ing({ id: 'j', quantity: 100, food: food({ kcal100g: 400, fat100g: 40 }) })], 4)
    expect(n.total.kcal).toBe(600)
    expect(n.perServing.kcal).toBe(150)
    expect(n.perServing.fat).toBeCloseTo(10.5)
    expect(n.isEstimated).toBe(false)
  })
  it('por 100 g con yieldGrams', () => {
    const n = recipeNutrition([ing({ quantity: 200 })], 2, 400)
    expect(n.per100g?.kcal).toBe(50)
  })
  it('por 100 g sin yield: suma de masas con densidad y gramos por unidad', () => {
    const n = recipeNutrition([
      ing({ quantity: 100, unit: 'g' }),
      ing({ id: 'm', quantity: 100, unit: 'ml', food: food({ densityGPerMl: 1.5, kcal100g: 0 }) }),
      ing({ id: 'u', quantity: 2, unit: 'ud', food: food({ gramsPerUnit: 50, kcal100g: 0 }) }),
    ], 1)
    // masa = 100 + 150 + 100 = 350 g; kcal = 100
    expect(n.per100g?.kcal).toBeCloseTo(28.57, 1)
  })
  it('ml sin densidad cuenta 1:1', () => {
    const n = recipeNutrition([ing({ quantity: 200, unit: 'ml', food: food({ kcal100g: 50 }) })], 1)
    expect(n.total.kcal).toBe(100)
    expect(n.per100g?.kcal).toBe(50)
  })
  it('ud sin gramos por unidad → per100g null y estimado', () => {
    const n = recipeNutrition([ing({ quantity: 2, unit: 'ud' })], 1)
    expect(n.per100g).toBeNull()
    expect(n.isEstimated).toBe(true)
  })
  it('ingrediente sin alimento o sin base se ignora y marca estimado', () => {
    const n = recipeNutrition([ing({}), ing({ id: 'x', food: null }), ing({ id: 'y', quantity: null, unit: null })], 1)
    expect(n.total.kcal).toBe(100)
    expect(n.isEstimated).toBe(true)
  })
  it('alimento estimado propaga la etiqueta', () => {
    expect(recipeNutrition([ing({ food: food({ isEstimated: true }) })], 1).isEstimated).toBe(true)
  })
  it('INVARIANTE: escalar la receta no cambia las kcal por ración', () => {
    const ingredients = [ing({ quantity: 300 }), ing({ id: 's', quantity: 5, scalesLinearly: false, food: food({ kcal100g: 0 }) })]
    const base = recipeNutrition(ingredients, 4)
    const scaled = scaleRecipe({ servingsBase: 4, ingredients }, 6)
    const after = recipeNutrition(scaled.ingredients.map((i, k) => ({ ...i, food: ingredients[k]?.food ?? null })), 6)
    expect(Math.round(after.perServing.kcal)).toBe(Math.round(base.perServing.kcal))
    expect(after.total.kcal).toBeCloseTo(base.total.kcal * 1.5)
  })
  it('raciones no positivas lanzan', () => expect(() => recipeNutrition([], 0)).toThrow())
})

describe('aggregateNutrition', () => {
  it('suma totales ponderando por raciones y calcula media por ración', () => {
    const a = recipeNutrition([ing({ quantity: 100 })], 1) // 100 kcal/ración
    const b = recipeNutrition([ing({ quantity: 300 })], 1) // 300 kcal/ración
    const agg = aggregateNutrition([{ nutrition: a, servings: 2 }, { nutrition: b, servings: 1 }])
    expect(agg.total.kcal).toBe(500)
    expect(agg.perServing.kcal).toBeCloseTo(166.67, 1)
    expect(agg.per100g).toBeNull()
  })
})
