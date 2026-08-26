import { describe, expect, it } from 'vitest'
import es from './__fixtures__/ingredients.es.json'
import en from './__fixtures__/ingredients.en.json'
import { parseIngredientLine } from './ingredients-parser'

// needsReview solo se declara donde importa: en los casos que el parser debe
// marcar para que alguien los mire (línea con números pegados al alimento,
// unidad vaga sobre un nombre largo, conectores sueltos…).
type Fixture = { raw: string; expected: { quantity: number | null; unit: string | null; foodName: string; preparation: string | null }; needsReview?: boolean }

describe('parseIngredientLine', () => {
  describe('es', () => {
    for (const f of es as Fixture[]) {
      it(f.raw, () => {
        const r = parseIngredientLine(f.raw, 'es')
        expect({ quantity: r.quantity, unit: r.unit, foodName: r.foodName, preparation: r.preparation }).toEqual(f.expected)
        if (f.needsReview !== undefined) expect(r.needsReview).toBe(f.needsReview)
      })
    }
  })
  describe('en', () => {
    for (const f of en as Fixture[]) {
      it(f.raw, () => {
        const r = parseIngredientLine(f.raw, 'en')
        expect({ quantity: r.quantity, unit: r.unit, foodName: r.foodName, preparation: r.preparation }).toEqual(f.expected)
        if (f.needsReview !== undefined) expect(r.needsReview).toBe(f.needsReview)
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
  it('marca para revisar: números en el alimento, conectores sueltos, unidad vaga sobre nombre largo y frase sin cantidad', () => {
    expect(parseIngredientLine('2 latas de 400 g de tomate', 'es').needsReview).toBe(true)
    expect(parseIngredientLine('pan rallado y perejil picado de', 'es').needsReview).toBe(true)
    expect(parseIngredientLine('olive oil and', 'en').needsReview).toBe(true)
    expect(parseIngredientLine('una pizca de pimienta negra en grano', 'es').needsReview).toBe(true)
    expect(parseIngredientLine('reservar el agua de cocción de la pasta', 'es').needsReview).toBe(true)
    // Lo normal sigue sin marcarse
    expect(parseIngredientLine('200 g de harina', 'es').needsReview).toBe(false)
    expect(parseIngredientLine('1 pizca de sal', 'es').needsReview).toBe(false)
    expect(parseIngredientLine('2 cups flour', 'en').needsReview).toBe(false)
  })
})
