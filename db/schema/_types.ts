import { customType, pgEnum } from 'drizzle-orm/pg-core'

// Tipos que drizzle no trae de serie
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

// Enums compartidos entre agregados
export const baseUnitEnum = pgEnum('base_unit', ['g', 'ml', 'ud'])
export const aiProviderEnum = pgEnum('ai_provider', ['none', 'anthropic', 'openai', 'openai_compatible'])
export const unitSystemEnum = pgEnum('unit_system', ['metric', 'imperial'])
export const themeEnum = pgEnum('theme', ['system', 'light', 'dark'])
export const householdRoleEnum = pgEnum('household_role', ['owner', 'member'])
export const challengeKindEnum = pgEnum('webauthn_challenge_kind', ['register', 'login'])
export const foodSourceEnum = pgEnum('food_source', ['off', 'usda', 'manual', 'ai'])
export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard'])
export const mealSlotEnum = pgEnum('meal_slot', ['breakfast', 'lunch', 'dinner', 'snack'])
export const pantryLocationEnum = pgEnum('pantry_location', ['fridge', 'freezer', 'pantry'])
export const proposalStatusEnum = pgEnum('proposal_status', ['pending', 'approved', 'rejected'])
export const proposalSourceEnum = pgEnum('proposal_source', ['ai', 'rules', 'mcp'])
export const mcpProfileEnum = pgEnum('mcp_profile', ['basic', 'full'])
