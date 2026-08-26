import { z } from 'zod'

// Duplicado deliberado de db/schema/tokens.ts::API_SCOPES: las fronteras de
// eslint-boundaries prohíben que lib/validation importe de db/**. Si la lista
// cambia, hay que actualizar ambos sitios (comprobado en tests/contracts/api-scopes.test.ts).
export const API_SCOPES = [
  'recipes:read', 'recipes:write', 'plan:read', 'plan:write', 'pantry:read', 'pantry:write',
  'cooking:write', 'shopping:push', 'household:read', 'household:write',
] as const

export const ApiScopeSchema = z.enum(API_SCOPES)
export const ApiTokenCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(60), scopes: z.array(ApiScopeSchema).min(0).max(API_SCOPES.length), mcpProfile: z.enum(['basic', 'full']).default('basic') })
