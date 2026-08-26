import { describe, expect, it } from 'vitest'
import { assertUniqueNames, dedupeByNameEs, selectFoods, toSeed, type FoodSeed } from './build-foods-seed'

const food = (fdcId: number, description: string, dataType = 'SR Legacy', kcal = 40) => ({
  fdcId, description, dataType, foodNutrients: [{ nutrient: { id: 1008 }, amount: kcal }, { nutrient: { id: 1003 }, amount: 1.1 }],
})

const withNutrients = (fdcId: number, description: string, dataType: string, nutrients: { nutrient: { id: number }; amount?: number }[]) => ({
  fdcId, description, dataType, foodNutrients: nutrients,
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
  it('deduplica descripciones idénticas quedándose con la mejor tras el sort (dos "Oil, canola")', () => {
    // Foundation sin macros vs. SR Legacy con energía real y mismo nombre exacto.
    const foundation = withNutrients(1, 'Oil, canola', 'Foundation', [{ nutrient: { id: 1085 }, amount: 94.5 }])
    const srLegacy = withNutrients(2, 'Oil, canola', 'SR Legacy', [{ nutrient: { id: 1008 }, amount: 884 }, { nutrient: { id: 1003 }, amount: 0 }, { nutrient: { id: 1005 }, amount: 0 }, { nutrient: { id: 1004 }, amount: 100 }])
    const r = selectFoods([foundation, srLegacy], { exclude: [], keywords: ['oil, canola'] })
    expect(r).toHaveLength(1)
    expect(r[0]?.food.fdcId).toBe(2)
  })
  it('deduplica tras limpiar boilerplate ("Pears, raw, bartlett" con y sin nota de programa USDA)', () => {
    const plain = food(1, 'Pears, raw, bartlett')
    const withNote = food(2, "Pears, raw, bartlett (Includes foods for USDA's Food Distribution Program)")
    const r = selectFoods([plain, withNote], { exclude: [], keywords: ['pears'] })
    expect(r).toHaveLength(1)
  })

  describe('energía: 1008 → 2047 → 2048, nunca 1063 (azúcares) como proxy de carbohidratos', () => {
    it('usa 1008 cuando existe', () => {
      const f = withNutrients(1, 'Onions, raw', 'Foundation', [{ nutrient: { id: 1008 }, amount: 40 }])
      const s = toSeed(f, 'onions', undefined)
      expect(s.kcal100g).toBe(40)
      expect(s.isEstimated).toBe(false)
    })
    it('cae a 2047 (Atwater general) si falta 1008', () => {
      const f = withNutrients(2, 'Onions, raw', 'Foundation', [{ nutrient: { id: 2047 }, amount: 42 }])
      const s = toSeed(f, 'onions', undefined)
      expect(s.kcal100g).toBe(42)
      expect(s.isEstimated).toBe(false)
    })
    it('cae a 2048 (Atwater específico) si faltan 1008 y 2047', () => {
      const f = withNutrients(3, 'Onions, raw', 'Foundation', [{ nutrient: { id: 2048 }, amount: 44 }])
      const s = toSeed(f, 'onions', undefined)
      expect(s.kcal100g).toBe(44)
      expect(s.isEstimated).toBe(false)
    })
    it('con proteína, carbohidratos (1005) y grasa completos, deriva por Atwater', () => {
      const f = withNutrients(4, 'Some food', 'Foundation', [
        { nutrient: { id: 1003 }, amount: 2 }, { nutrient: { id: 1005 }, amount: 10 }, { nutrient: { id: 1004 }, amount: 5 },
      ])
      const s = toSeed(f, 'some food', undefined)
      expect(s.kcal100g).toBeCloseTo(4 * 2 + 4 * 10 + 9 * 5, 5)
      expect(s.isEstimated).toBe(true)
    })
    it('con solo grasa (sin proteína ni carbohidratos), NO deriva: kcal null pero isEstimated', () => {
      // Antes de esta corrección se derivaba tratando lo que falta como 0
      // (mantequilla → 9×81.5). Ahora, sin los tres macros, no se inventa nada.
      const f = withNutrients(5, 'Butter, stick, unsalted', 'Foundation', [{ nutrient: { id: 1004 }, amount: 81.5 }])
      const s = toSeed(f, 'butter', undefined)
      expect(s.kcal100g).toBeNull()
      expect(s.isEstimated).toBe(true)
    })
    it('NUNCA usa azúcares totales (1063) como sustituto de carbohidratos (1005)', () => {
      // Antes daba 4×1.47 + 4×3.15 (usando 1063) = 18.5 kcal para un puerro
      // cuyo valor real ronda 61 kcal. Ahora, sin 1005, no deriva.
      const f = withNutrients(6, 'Leeks, bulb and greens, root removed, raw', 'Foundation', [
        { nutrient: { id: 1003 }, amount: 1.47 }, { nutrient: { id: 1063 }, amount: 3.15 }, { nutrient: { id: 1079 }, amount: 3.0 },
      ])
      const s = toSeed(f, 'leeks', undefined)
      expect(s.kcal100g).toBeNull()
      expect(s.isEstimated).toBe(true)
    })
    it('sin ningún macronutriente reportado, kcal queda null (no se inventa un 0)', () => {
      const f = withNutrients(7, 'Salt, table, iodized', 'Foundation', [])
      const s = toSeed(f, 'salt, table', undefined)
      expect(s.kcal100g).toBeNull()
      expect(s.isEstimated).toBe(true)
    })
  })

  describe('selección: descarta un candidato sin energía fiable si hay un hermano con energía real', () => {
    it('un "Salt, table, iodized" sin macros se descarta si "Salt, table" tiene kcal real', () => {
      const noData = withNutrients(1, 'Salt, table, iodized', 'Foundation', [])
      const withKcal = withNutrients(2, 'Salt, table', 'SR Legacy', [{ nutrient: { id: 1008 }, amount: 0 }])
      const r = selectFoods([noData, withKcal], { exclude: [], keywords: ['salt, table'] })
      expect(r.map((x) => x.food.fdcId)).toEqual([2])
    })
    it('si NINGÚN candidato del grupo tiene energía fiable, se conservan todos (con kcal null más adelante)', () => {
      const a = withNutrients(1, 'Foo, raw', 'Foundation', [{ nutrient: { id: 1003 }, amount: 1 }])
      const b = withNutrients(2, 'Foo, cooked', 'Foundation', [{ nutrient: { id: 1004 }, amount: 1 }])
      const r = selectFoods([a, b], { exclude: [], keywords: ['foo'] })
      expect(r.map((x) => x.food.fdcId).sort()).toEqual([1, 2])
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
    it('"Mango nectar, canned" es líquido: mililitros, densidad 1.04', () => {
      const s = toSeed(food(1, 'Mango nectar, canned'), 'mango', undefined)
      expect(s.defaultUnit).toBe('ml')
      expect(s.densityGPerMl).toBe(1.04)
    })
    it('la miel se pesa, no se mide en ml (aunque sea líquida)', () => {
      const s = toSeed(food(1, 'Honey'), 'honey', undefined)
      expect(s.defaultUnit).toBe('g')
    })
    it('"Gelatin desserts, dry mix, prepared with water" no es agua: gramos', () => {
      const s = toSeed(food(1, 'Gelatin desserts, dry mix, prepared with water'), 'gelatin', undefined)
      expect(s.defaultUnit).toBe('g')
    })
    it('un caldo en polvo se pesa: gramos y sin densidad', () => {
      const s = toSeed(food(1, 'Soup, chicken broth or bouillon, dry'), 'soup, chicken broth', undefined)
      expect(s.defaultUnit).toBe('g')
      expect(s.densityGPerMl).toBeNull()
    })
    it('una pastilla de caldo se cuenta: unidades', () => {
      const s = toSeed(food(1, 'Soup, chicken broth cubes, dry'), 'soup, chicken broth', undefined)
      expect(s.defaultUnit).toBe('ud')
      expect(s.densityGPerMl).toBeNull()
    })
    it('un café instantáneo con leche en polvo se pesa', () => {
      const s = toSeed(food(1, 'Beverages, coffee, instant, with whitener, reduced calorie'), 'coffee', undefined)
      expect(s.defaultUnit).toBe('g')
    })
    it('un caldo casero sigue siendo líquido', () => {
      const s = toSeed(food(1, 'Soup, stock, chicken, home-prepared'), 'soup, stock', undefined)
      expect(s.defaultUnit).toBe('ml')
      expect(s.densityGPerMl).toBe(1)
    })
  })

  describe('un nombre en español, un alimento', () => {
    const seed = (sourceRef: string, nameEs: string, nameEn: string, macros = true): FoodSeed => ({
      sourceRef, nameEs, nameEn, aliases: [], defaultUnit: 'g', kcal100g: 10,
      protein100g: macros ? 1 : null, carbs100g: macros ? 1 : null, fat100g: macros ? 1 : null, fiber100g: null,
      isEstimated: false, gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null, allergens: [], seasonalMonths: [],
    })
    it('prefiere "all commercial varieties"', () => {
      const r = dedupeByNameEs([seed('1', 'aguacate', 'Avocados, raw, California'), seed('2', 'aguacate', 'Avocados, raw, all commercial varieties')])
      expect(r.map((f) => f.sourceRef)).toEqual(['2'])
    })
    it('prefiere la versión sin sal añadida', () => {
      const r = dedupeByNameEs([seed('1', 'apio cocido', 'Celery, cooked, with salt'), seed('2', 'apio cocido', 'Celery, cooked, without salt')])
      expect(r.map((f) => f.sourceRef)).toEqual(['2'])
    })
    it('prefiere la que tiene los tres macros y, a igualdad, la descripción más corta', () => {
      expect(dedupeByNameEs([seed('1', 'nuez', 'Nuts, walnuts', false), seed('2', 'nuez', 'Nuts, walnuts, english')]).map((f) => f.sourceRef)).toEqual(['2'])
      expect(dedupeByNameEs([seed('1', 'pera', 'Pears, raw, red anjou'), seed('2', 'pera', 'Pears, raw')]).map((f) => f.sourceRef)).toEqual(['2'])
    })
    it('conserva el orden original y deja pasar los nombres únicos', () => {
      const r = dedupeByNameEs([seed('1', 'ajo', 'Garlic, raw'), seed('2', 'pera', 'Pears, raw, bosc'), seed('3', 'pera', 'Pears, raw')])
      expect(r.map((f) => f.sourceRef)).toEqual(['1', '3'])
    })
    it('assertUniqueNames revienta con un duplicado', () => {
      expect(() => assertUniqueNames([seed('1', 'pera', 'Pears, raw'), seed('2', 'pera', 'Pears, raw, bosc')])).toThrow(/nameEs duplicado/)
      expect(() => assertUniqueNames([seed('1', 'pera', 'Pears, raw')])).not.toThrow()
    })
  })
})
