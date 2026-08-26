import { describe, expect, it } from 'vitest'
import { selectFoods, toSeed } from './build-foods-seed'

const food = (fdcId: number, description: string, dataType = 'SR Legacy', kcal = 40) => ({
  fdcId, description, dataType, foodNutrients: [{ nutrient: { id: 1008 }, amount: kcal }, { nutrient: { id: 1003 }, amount: 1.1 }],
})

describe('build-foods-seed', () => {
  it('selecciona por prefijo, prefiere raw y limita por palabra clave', () => {
    const all = [food(1, 'Onions, raw'), food(2, 'Onions, cooked, boiled'), food(3, 'Onions, dehydrated'), food(4, 'Onions, frozen'), food(5, 'Babyfood, onions')]
    const r = selectFoods(all, { exclude: ['babyfood'], keywords: ['onions'] })
    expect(r.map((x) => x.food.fdcId)).toEqual([1, 2, 3])
  })
  it('no repite un alimento en dos palabras clave', () => {
    const all = [food(1, 'Beans, snap, green, raw')]
    const r = selectFoods(all, { exclude: [], keywords: ['beans, snap', 'green beans'] })
    expect(r).toHaveLength(1)
  })
  it('mapea nutrientes y aplica traducción', () => {
    const s = toSeed(food(1, 'Onions, raw'), 'onions', { nameEs: 'Cebolla', aliases: [], gramsPerCup: 160, gramsPerTbsp: null, gramsPerUnit: 150, densityGPerMl: null, allergens: [], seasonalMonths: [] })
    expect(s).toMatchObject({ sourceRef: '1', nameEs: 'Cebolla', kcal100g: 40, protein100g: 1.1, carbs100g: null, defaultUnit: 'g', gramsPerUnit: 150 })
  })
  it('líquidos: unidad ml y densidad 1 por defecto', () => {
    const s = toSeed(food(2, 'Milk, whole'), 'milk, whole', undefined)
    expect(s.defaultUnit).toBe('ml')
    expect(s.densityGPerMl).toBe(1)
    expect(s.nameEs).toBe('Milk, whole')
  })
})
