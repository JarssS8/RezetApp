import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { recipeIngredients, recipes } from './recipes'

describe('schema recipes', () => {
  it('quantity y unit base son nullable; display siempre existe', () => {
    const c = getTableColumns(recipeIngredients)
    expect(c.quantity.notNull).toBe(false)
    expect(c.unit.notNull).toBe(false)
    expect(c.rawText.notNull).toBe(true)
    expect(c.scalesLinearly.default).toBe(true)
  })
  it('recipes lleva nutrición desnormalizada y soft delete', () => {
    const cols = Object.keys(getTableColumns(recipes))
    expect(cols).toEqual(expect.arrayContaining(['kcalPerServing', 'kcal100g', 'nutritionIsEstimated', 'yieldGrams', 'deletedAt', 'searchVector']))
  })
})
