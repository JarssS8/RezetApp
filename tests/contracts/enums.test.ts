import { describe, expect, it } from 'vitest'
import * as pg from '@/db/schema/_types'
import { API_SCOPES as dbScopes } from '@/db/schema/tokens'
import { LOCALES as authLocales } from '@/lib/auth/ctx'
import { LOCALES as domainLocales } from '@/lib/domain/types'
import { ACCENTS, LOCALES as prefsLocales, THEMES } from '@/lib/prefs'
import {
  AiProviderSchema, BaseUnitSchema, DifficultySchema, FoodSourceSchema, LocaleSchema, McpProfileSchema, MealSlotSchema,
  ProposalSourceSchema, ProposalStatusSchema, ThemeSchema, UnitSystemSchema,
} from '@/lib/validation/common'
import { UserPrefsSchema } from '@/lib/validation/household'
import { PantryLocationSchema } from '@/lib/validation/pantry'
import { API_SCOPES as validationScopes } from '@/lib/validation/tokens'

// Las fronteras de eslint-boundaries impiden que lib/validation importe de db/**
// (y al revés), así que los enums viven duplicados a propósito. Este fichero, que
// queda fuera de la valla, es el que garantiza que las dos listas no se separen.
// tests/contracts/api-scopes.test.ts cubre el mismo contrato para los scopes.
const CASES: [string, readonly string[], readonly string[]][] = [
  ['base_unit', BaseUnitSchema.options, pg.baseUnitEnum.enumValues],
  ['meal_slot', MealSlotSchema.options, pg.mealSlotEnum.enumValues],
  ['pantry_location', PantryLocationSchema.options, pg.pantryLocationEnum.enumValues],
  ['theme', ThemeSchema.options, pg.themeEnum.enumValues],
  ['unit_system', UnitSystemSchema.options, pg.unitSystemEnum.enumValues],
  ['difficulty', DifficultySchema.options, pg.difficultyEnum.enumValues],
  ['mcp_profile', McpProfileSchema.options, pg.mcpProfileEnum.enumValues],
  ['ai_provider', AiProviderSchema.options, pg.aiProviderEnum.enumValues],
  ['food_source', FoodSourceSchema.options, pg.foodSourceEnum.enumValues],
  ['proposal_source', ProposalSourceSchema.options, pg.proposalSourceEnum.enumValues],
  ['proposal_status', ProposalStatusSchema.options, pg.proposalStatusEnum.enumValues],
]

describe('contrato de enums', () => {
  for (const [name, zodValues, pgValues] of CASES) {
    it(`${name}: el enum de zod y el pgEnum coinciden`, () => {
      expect([...zodValues]).toEqual([...pgValues])
    })
  }
  it('los scopes de API coinciden y household:write está en ambos', () => {
    expect([...validationScopes]).toEqual([...dbScopes])
    expect(validationScopes).toContain('household:write')
  })
  it('Locale es la misma lista en dominio, auth, prefs y validación', () => {
    expect([...authLocales]).toEqual([...domainLocales])
    expect([...prefsLocales]).toEqual([...domainLocales])
    expect([...LocaleSchema.options]).toEqual([...domainLocales])
  })
  it('THEMES de lib/prefs coincide con el enum theme', () => {
    expect([...THEMES]).toEqual([...pg.themeEnum.enumValues])
  })
  it('ACCENTS de lib/prefs coincide con UserPrefsSchema.accent', () => {
    expect([...UserPrefsSchema.shape.accent.unwrap().options]).toEqual([...ACCENTS])
  })
})
