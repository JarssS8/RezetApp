import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { foods, unitAliases } from './foods'

describe('schema foods', () => {
  it('foods tiene nombres de búsqueda en ambos idiomas y conversiones por alimento', () => {
    const cols = Object.keys(getTableColumns(foods))
    expect(cols).toEqual(expect.arrayContaining(['searchNameEs', 'searchNameEn', 'gramsPerCup', 'gramsPerTbsp', 'gramsPerUnit', 'densityGPerMl', 'isEstimated', 'mergedIntoId']))
  })
  it('foods.household_id es nullable (global)', () => {
    expect(getTableColumns(foods).householdId.notNull).toBe(false)
  })
  it('unit_aliases factor es numérico obligatorio', () => {
    expect(getTableColumns(unitAliases).factorToBase.notNull).toBe(true)
  })
})
