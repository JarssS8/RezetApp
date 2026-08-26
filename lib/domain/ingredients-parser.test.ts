import { describe, expect, it } from 'vitest'
import es from './__fixtures__/ingredients.es.json'
import en from './__fixtures__/ingredients.en.json'
import { parseIngredientLine } from './ingredients-parser'

type Fixture = { raw: string; expected: { quantity: number | null; unit: string | null; foodName: string; preparation: string | null } }

describe('parseIngredientLine', () => {
  describe('es', () => {
    for (const f of es as Fixture[]) {
      it(f.raw, () => {
        const r = parseIngredientLine(f.raw, 'es')
        expect({ quantity: r.quantity, unit: r.unit, foodName: r.foodName, preparation: r.preparation }).toEqual(f.expected)
      })
    }
  })
  describe('en', () => {
    for (const f of en as Fixture[]) {
      it(f.raw, () => {
        const r = parseIngredientLine(f.raw, 'en')
        expect({ quantity: r.quantity, unit: r.unit, foodName: r.foodName, preparation: r.preparation }).toEqual(f.expected)
      })
    }
  })
  it('tiene al menos 40 casos en es y 20 en en', () => {
    expect((es as Fixture[]).length).toBeGreaterThanOrEqual(40)
    expect((en as Fixture[]).length).toBeGreaterThanOrEqual(20)
  })
  it('confianza: completo 1, sin unidad 0.8, sin cantidad 0.7, sin alimento → needsReview', () => {
    expect(parseIngredientLine('200 g de harina', 'es').confidence).toBe(1)
    expect(parseIngredientLine('3 huevos', 'es').confidence).toBe(0.8)
    expect(parseIngredientLine('aceite de oliva', 'es').confidence).toBe(0.7)
    const bad = parseIngredientLine('2 cdas de', 'es')
    expect(bad.needsReview).toBe(true)
    expect(bad.foodName).toBe('')
  })
  it('línea vacía → needsReview', () => expect(parseIngredientLine('   ', 'es').needsReview).toBe(true))
})
