import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { mcpProfileEnum } from './_types'
import { households, users } from './households'

export const API_SCOPES = [
  'recipes:read', 'recipes:write', 'plan:read', 'plan:write', 'pantry:read', 'pantry:write',
  'cooking:write', 'shopping:push', 'household:read',
] as const
export type ApiScope = (typeof API_SCOPES)[number]

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(), // sha256 hex del token completo
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    mcpProfile: mcpProfileEnum('mcp_profile').notNull().default('basic'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_tokens_household_idx').on(t.householdId), uniqueIndex('api_tokens_hash_uidx').on(t.tokenHash)],
)

export const aiUsageLog = pgTable(
  'ai_usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_log_household_created_idx').on(t.householdId, t.createdAt)],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    endpoint: text('endpoint').notNull().unique(),
    keys: jsonb('keys').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

export type ApiToken = typeof apiTokens.$inferSelect
