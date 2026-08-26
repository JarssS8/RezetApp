import { sql } from 'drizzle-orm'
import {
  boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid,
} from 'drizzle-orm/pg-core'
import {
  aiProviderEnum, bytea, challengeKindEnum, householdRoleEnum, themeEnum, unitSystemEnum,
} from './_types'

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  defaultServings: integer('default_servings').notNull().default(2),
  expiryAlertDays: integer('expiry_alert_days').notNull().default(3),
  aiProvider: aiProviderEnum('ai_provider').notNull().default('none'),
  aiModel: text('ai_model'),
  aiBaseUrl: text('ai_base_url'),
  aiApiKeyEnc: bytea('ai_api_key_enc'),
  aiMonthlyCapCents: integer('ai_monthly_cap_cents').notNull().default(0),
  aiStructuredOutput: boolean('ai_structured_output').notNull().default(true),
  shoplistListToken: text('shoplist_list_token'),
  shoplistFnUrl: text('shoplist_fn_url'),
  shoplistSecretEnc: bytea('shoplist_secret_enc'),
  shoplistLastPushedAt: timestamp('shoplist_last_pushed_at', { withTimezone: true }),
  planRules: jsonb('plan_rules').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('es'),
  units: unitSystemEnum('units').notNull().default('metric'),
  theme: themeEnum('theme').notNull().default('system'),
  accent: text('accent').notNull().default('huerta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id').notNull().references(() => households.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: householdRoleEnum('role').notNull().default('member'),
    dietaryFlags: text('dietary_flags').array().notNull().default(sql`'{}'::text[]`),
    allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), index('household_members_user_idx').on(t.userId)],
)

export const householdInvites = pgTable(
  'household_invites',
  {
    token: text('token').primaryKey(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('household_invites_household_idx').on(t.householdId)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 32 bytes aleatorios en base64url
    userId: uuid('user_id').notNull().references(() => users.id),
    householdId: uuid('household_id').notNull().references(() => households.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_household_idx').on(t.householdId)],
)

export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    credentialId: text('credential_id').primaryKey(), // base64url tal como lo da el navegador
    userId: uuid('user_id').notNull().references(() => users.id),
    publicKey: bytea('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports').array().notNull().default(sql`'{}'::text[]`),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('webauthn_credentials_user_idx').on(t.userId)],
)

export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challenge: text('challenge').notNull(),
    userId: uuid('user_id').references(() => users.id),
    kind: challengeKindEnum('kind').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  // La limpieza de retos caducados (saveChallenge) barre por expires_at
  (t) => [index('webauthn_challenges_expires_idx').on(t.expiresAt)],
)

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Household = typeof households.$inferSelect
export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect
