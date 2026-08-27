import { describe, expect, it } from 'vitest'
import { mapMigration, mealieToRecipeInput, tandoorToRecipeInput } from './migrations'

const mealieRecipe = {
  name: 'Sopa de cebolla',
  description: 'Clásica',
  recipeYield: '4 servings',
  prepTime: 'PT10M',
  performTime: 'PT40M',
  orgURL: 'https://example.com/sopa',
  tags: [{ name: 'Sopa' }, { name: 'Invierno' }],
  recipeIngredient: [
    { display: '2 cebollas grandes' },
    { quantity: 1, unit: { name: 'cdta' }, food: { name: 'sal' }, note: 'al gusto' },
  ],
  recipeInstructions: [{ text: 'Pocha la cebolla 20 minutos' }, { text: 'Añade el caldo' }],
}

const tandoorRecipe = {
  name: 'Tortilla',
  description: 'De patatas',
  servings: 2,
  working_time: 15,
  waiting_time: 5,
  source_url: 'https://example.com/tortilla',
  keywords: [{ name: 'Rápido' }],
  steps: [
    {
      instruction: 'Fríe las patatas',
      ingredients: [
        { amount: 4, unit: { name: 'ud' }, food: { name: 'huevos' }, note: '' },
        { amount: 0, unit: null, food: { name: 'sal' }, note: 'al gusto' },
      ],
    },
    { instruction: 'Cuaja la tortilla', ingredients: [] },
  ],
}

describe('mealieToRecipeInput', () => {
  it('traduce título, tiempos, raciones, etiquetas, ingredientes y pasos', () => {
    const out = mealieToRecipeInput(mealieRecipe)
    expect(out).toMatchObject({
      title: 'Sopa de cebolla',
      description: 'Clásica',
      servingsBase: 4,
      prepMinutes: 10,
      cookMinutes: 40,
      sourceUrl: 'https://example.com/sopa',
      tags: ['Sopa', 'Invierno'],
    })
    expect(out?.ingredients.map((i) => i.rawText)).toEqual(['2 cebollas grandes', '1 cdta sal al gusto'])
    expect(out?.steps.map((s) => s.text)).toEqual(['Pocha la cebolla 20 minutos', 'Añade el caldo'])
  })

  it('sin nombre o sin ingredientes devuelve null en vez de una receta rota', () => {
    expect(mealieToRecipeInput({ ...mealieRecipe, name: '' })).toBeNull()
    expect(mealieToRecipeInput({ ...mealieRecipe, recipeIngredient: [] })).toBeNull()
    expect(mealieToRecipeInput('no soy un objeto')).toBeNull()
  })

  it('un recipeYield sin número cae a 2 raciones', () => {
    expect(mealieToRecipeInput({ ...mealieRecipe, recipeYield: 'una fuente' })?.servingsBase).toBe(2)
  })
})

describe('tandoorToRecipeInput', () => {
  it('aplana los ingredientes de todos los pasos conservando su stepIndex', () => {
    const out = tandoorToRecipeInput(tandoorRecipe)
    expect(out).toMatchObject({ title: 'Tortilla', servingsBase: 2, prepMinutes: 15, cookMinutes: 5 })
    expect(out?.ingredients.map((i) => i.rawText)).toEqual(['4 ud huevos', 'sal al gusto'])
    expect(out?.ingredients.every((i) => i.stepIndex === 0)).toBe(true)
    expect(out?.steps).toHaveLength(2)
  })

  it('sin pasos con instrucción devuelve null', () => {
    expect(tandoorToRecipeInput({ ...tandoorRecipe, steps: [] })).toBeNull()
  })
})

describe('mapMigration', () => {
  it('separa lo que se puede migrar de lo que no, con el motivo', () => {
    const result = mapMigration('mealie', [mealieRecipe, { name: 'Rota', recipeIngredient: [] }, 42])
    expect(result.recipes).toHaveLength(1)
    expect(result.skipped).toEqual([
      { title: 'Rota', reason: 'incomplete' },
      { title: '(sin título)', reason: 'incomplete' },
    ])
  })
})
