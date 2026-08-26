import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { cookingLog, mealPlanEntries, planProposals } from './plan'

describe('schema plan', () => {
  it('entradas del plan tienen cooked_at y skipped_at', () => {
    const cols = Object.keys(getTableColumns(mealPlanEntries))
    expect(cols).toEqual(expect.arrayContaining(['cookedAt', 'skippedAt', 'leftoverOfEntryId', 'servings']))
  })
  it('propuestas distinguen usuario y token creador', () => {
    const cols = Object.keys(getTableColumns(planProposals))
    expect(cols).toEqual(expect.arrayContaining(['createdByUserId', 'createdByTokenId', 'source']))
  })
  it('cooking_log guarda descuentos y avisos', () => {
    expect(Object.keys(getTableColumns(cookingLog))).toEqual(expect.arrayContaining(['pantryDeductions', 'warnings', 'kcalPerServingSnapshot']))
  })
})
