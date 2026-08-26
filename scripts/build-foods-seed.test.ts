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
  it('líquidos: unidad ml y densidad de la tabla (leche 1.03)', () => {
    const s = toSeed(food(2, 'Milk, whole'), 'milk, whole', undefined)
    expect(s.defaultUnit).toBe('ml')
    expect(s.densityGPerMl).toBe(1.03)
    expect(s.nameEs).toBe('Milk, whole')
  })
  it('no confunde palabra clave con prefijo pegado ("butter" no engancha "Butterbur")', () => {
    const all = [food(1, 'Butterbur, (fuki), raw'), food(2, 'Butter, stick, unsalted')]
    const r = selectFoods(all, { exclude: [], keywords: ['butter'] })
    expect(r.map((x) => x.food.fdcId)).toEqual([2])
  })

  describe('energía: 1008 → 2047 → 2048', () => {
    const withNutrients = (fdcId: number, description: string, nutrients: { nutrient: { id: number }; amount?: number }[]) => ({
      fdcId, description, dataType: 'Foundation', foodNutrients: nutrients,
    })

    it('usa 1008 cuando existe', () => {
      const f = withNutrients(1, 'Onions, raw', [{ nutrient: { id: 1008 }, amount: 40 }])
      const s = toSeed(f, 'onions', undefined)
      expect(s.kcal100g).toBe(40)
      expect(s.isEstimated).toBe(false)
    })
    it('cae a 2047 (Atwater general) si falta 1008', () => {
      const f = withNutrients(2, 'Onions, raw', [{ nutrient: { id: 2047 }, amount: 42 }])
      const s = toSeed(f, 'onions', undefined)
      expect(s.kcal100g).toBe(42)
      expect(s.isEstimated).toBe(false)
    })
    it('cae a 2048 (Atwater específico) si faltan 1008 y 2047', () => {
      const f = withNutrients(3, 'Onions, raw', [{ nutrient: { id: 2048 }, amount: 44 }])
      const s = toSeed(f, 'onions', undefined)
      expect(s.kcal100g).toBe(44)
      expect(s.isEstimated).toBe(false)
    })
    it('sin ninguna energía directa, deriva por Atwater y marca isEstimated', () => {
      const f = withNutrients(4, 'Butter, stick, unsalted', [{ nutrient: { id: 1004 }, amount: 81.5 }])
      const s = toSeed(f, 'butter', undefined)
      expect(s.kcal100g).toBeCloseTo(9 * 81.5, 5)
      expect(s.isEstimated).toBe(true)
    })
    it('sin ningún macronutriente reportado, deriva 0 (sal, bicarbonato)', () => {
      const f = withNutrients(5, 'Salt, table, iodized', [])
      const s = toSeed(f, 'salt, table', undefined)
      expect(s.kcal100g).toBe(0)
      expect(s.isEstimated).toBe(true)
    })
  })

  describe('líquidos por descripción, no por palabra clave', () => {
    it('"Watermelon, raw" no es agua: gramos', () => {
      const s = toSeed(food(1, 'Watermelon, raw'), 'watermelon', undefined)
      expect(s.defaultUnit).toBe('g')
    })
    it('"Beverages, orange juice" es zumo: mililitros, densidad 1.04', () => {
      const s = toSeed(food(1, 'Beverages, orange juice'), 'orange juice', undefined)
      expect(s.defaultUnit).toBe('ml')
      expect(s.densityGPerMl).toBe(1.04)
    })
    it('"Beerwurst, beer salami, pork" no es cerveza: gramos', () => {
      const s = toSeed(food(1, 'Beerwurst, beer salami, pork'), 'beer', undefined)
      expect(s.defaultUnit).toBe('g')
    })
  })
})
