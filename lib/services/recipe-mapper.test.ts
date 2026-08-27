import { describe, expect, it } from 'vitest'
import { detailToInput, type RecipeDetailForInput } from './recipe-mapper'

const detail: RecipeDetailForInput = {
  recipe: {
    title: 'Lentejas',
    description: 'Con chorizo',
    servingsBase: 4,
    prepMinutes: 15,
    cookMinutes: 45,
    difficulty: 'easy',
    sourceUrl: 'https://ejemplo.test/lentejas',
    imageUrls: ['https://ejemplo.test/lentejas.jpg'],
    notes: 'Mejor de un día para otro',
    yieldGrams: 1200,
  },
  ingredients: [
    {
      id: 'i1',
      foodId: 'f-lentejas',
      rawText: '400 g de lentejas',
      quantity: 400,
      unit: 'g',
      displayQuantity: 400,
      displayUnit: 'g',
      preparation: null,
      groupLabel: null,
      stepIndex: null,
      scalesLinearly: true,
      sortOrder: 0,
    },
    {
      id: 'i2',
      foodId: null,
      rawText: 'sal al gusto',
      quantity: null,
      unit: null,
      displayQuantity: null,
      displayUnit: null,
      preparation: null,
      groupLabel: null,
      stepIndex: null,
      scalesLinearly: false,
      sortOrder: 1,
    },
  ],
  steps: [{ text: 'Cuece 45 minutos.', timerSeconds: 2700, imageUrl: null }],
  tags: [{ name: 'legumbres' }],
}

describe('detailToInput', () => {
  it('convierte RecipeDetail a RecipeInput conservando foodId (a diferencia de exportAll)', () => {
    const input = detailToInput(detail)
    expect(input.title).toBe('Lentejas')
    expect(input.servingsBase).toBe(4)
    expect(input.tags).toEqual(['legumbres'])
    expect(input.ingredients).toEqual([
      {
        rawText: '400 g de lentejas',
        foodId: 'f-lentejas',
        quantity: 400,
        unit: 'g',
        displayQuantity: 400,
        displayUnit: 'g',
        preparation: null,
        groupLabel: null,
        stepIndex: null,
        scalesLinearly: true,
      },
      {
        rawText: 'sal al gusto',
        foodId: null,
        quantity: null,
        unit: null,
        displayQuantity: null,
        displayUnit: null,
        preparation: null,
        groupLabel: null,
        stepIndex: null,
        scalesLinearly: false,
      },
    ])
    expect(input.steps).toEqual([{ text: 'Cuece 45 minutos.', timerSeconds: 2700, imageUrl: null }])
  })
})
