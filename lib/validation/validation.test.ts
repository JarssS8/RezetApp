import { describe, expect, it } from 'vitest'
import {
  ApiTokenCreateSchema, DateRangeSchema, LogCookedSchema, PantryAdjustSchema, PlanBatchSchema, ProposalPayloadSchema, RecipeInputSchema, RecipeSearchSchema,
} from './index'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('validation', () => {
  it('DateRangeSchema exige from ≤ to y máximo 92 días', () => {
    expect(DateRangeSchema.safeParse({ from: '2026-08-01', to: '2026-08-31' }).success).toBe(true)
    expect(DateRangeSchema.safeParse({ from: '2026-08-31', to: '2026-08-01' }).success).toBe(false)
    expect(DateRangeSchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(false)
  })
  it('RecipeInputSchema: título, raciones ≥ 1, ingredientes con raw_text, pasos ordenados; rechaza claves extra', () => {
    const ok = RecipeInputSchema.safeParse({
      title: 'Lentejas', servingsBase: 4, ingredients: [{ rawText: '200 g de lentejas', scalesLinearly: true }], steps: [{ text: 'Cuece 30 min' }],
    })
    expect(ok.success).toBe(true)
    expect(RecipeInputSchema.safeParse({ title: '', servingsBase: 4, ingredients: [], steps: [] }).success).toBe(false)
    expect(RecipeInputSchema.safeParse({ title: 'x', servingsBase: 0, ingredients: [], steps: [] }).success).toBe(false)
    expect(RecipeInputSchema.safeParse({ title: 'x', servingsBase: 1, ingredients: [], steps: [], extra: 1 }).success).toBe(false)
  })
  it('RecipeSearchSchema: filtros opcionales con defaults', () => {
    const r = RecipeSearchSchema.parse({})
    expect(r).toMatchObject({ limit: 20, offset: 0 })
    expect(RecipeSearchSchema.safeParse({ maxMinutes: -1 }).success).toBe(false)
    expect(RecipeSearchSchema.safeParse({ hasIngredients: [uuid], tags: ['rapido'] }).success).toBe(true)
  })
  it('PlanBatchSchema: altas con fecha ISO y slot, bajas por id', () => {
    expect(PlanBatchSchema.safeParse({ add: [{ date: '2026-08-27', slot: 'dinner', recipeId: uuid, servings: 2 }], remove: [uuid] }).success).toBe(true)
    expect(PlanBatchSchema.safeParse({ add: [{ date: '27/08/2026', slot: 'dinner', recipeId: uuid, servings: 2 }], remove: [] }).success).toBe(false)
    expect(PlanBatchSchema.safeParse({ add: [{ date: '2026-08-27', slot: 'tea', recipeId: uuid, servings: 2 }], remove: [] }).success).toBe(false)
  })
  it('ProposalPayloadSchema es el mismo contrato que PlanBatchSchema', () => {
    expect(ProposalPayloadSchema.safeParse({ add: [], remove: [] }).success).toBe(true)
  })
  it('PantryAdjustSchema: delta distinto de 0', () => {
    expect(PantryAdjustSchema.safeParse({ itemId: uuid, delta: -50 }).success).toBe(true)
    expect(PantryAdjustSchema.safeParse({ itemId: uuid, delta: 0 }).success).toBe(false)
  })
  it('LogCookedSchema: entryId o recipeId, no ambos vacíos', () => {
    expect(LogCookedSchema.safeParse({ recipeId: uuid, servingsCooked: 3 }).success).toBe(true)
    expect(LogCookedSchema.safeParse({ entryId: uuid, servingsCooked: 3, leftovers: { servings: 1, date: '2026-08-28', slot: 'lunch' } }).success).toBe(true)
    expect(LogCookedSchema.safeParse({ servingsCooked: 3 }).success).toBe(false)
  })
  it('ApiTokenCreateSchema: scopes conocidos y perfil', () => {
    expect(ApiTokenCreateSchema.safeParse({ name: 'Escritorio', scopes: ['recipes:read', 'plan:read'], mcpProfile: 'basic' }).success).toBe(true)
    expect(ApiTokenCreateSchema.safeParse({ name: 'x', scopes: ['admin'] }).success).toBe(false)
  })
})
