import { sql } from 'drizzle-orm'
import { check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { baseUnitEnum, mealSlotEnum, pantryLocationEnum, proposalSourceEnum, proposalStatusEnum } from './_types'
import { foods } from './foods'
import { households, users } from './households'
import { recipes } from './recipes'

const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    date: date('date').notNull(),
    slot: mealSlotEnum('slot').notNull(),
    recipeId: uuid('recipe_id').references(() => recipes.id),
    customTitle: text('custom_title'),
    servings: integer('servings').notNull(),
    leftoverOfEntryId: uuid('leftover_of_entry_id'),
    timeBudgetMinutes: integer('time_budget_minutes'),
    cookedAt: timestamp('cooked_at', { withTimezone: true }),
    skippedAt: timestamp('skipped_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meal_plan_entries_household_date_idx').on(t.householdId, t.date),
    check('meal_plan_entries_title_or_recipe', sql`recipe_id IS NOT NULL OR custom_title IS NOT NULL`),
  ],
)

export const planProposals = pgTable(
  'plan_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdByTokenId: uuid('created_by_token_id'), // FK a api_tokens se añade en tokens.ts vía SQL de migración (evita import circular)
    source: proposalSourceEnum('source').notNull(),
    payload: jsonb('payload').notNull(),
    status: proposalStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id),
  },
  (t) => [
    index('plan_proposals_household_status_idx').on(t.householdId, t.status),
    check('plan_proposals_one_creator', sql`(created_by_user_id IS NOT NULL) <> (created_by_token_id IS NOT NULL)`),
  ],
)

export const pantryItems = pgTable(
  'pantry_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    foodId: uuid('food_id').notNull().references(() => foods.id),
    quantity: qty('quantity').notNull(),
    unit: baseUnitEnum('unit').notNull(),
    location: pantryLocationEnum('location').notNull().default('pantry'),
    expiresAt: date('expires_at'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pantry_items_household_food_idx').on(t.householdId, t.foodId),
    index('pantry_items_household_expires_idx').on(t.householdId, t.expiresAt),
    check('pantry_items_quantity_nonnegative', sql`quantity >= 0`),
  ],
)

export const cookingLog = pgTable(
  'cooking_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id),
    entryId: uuid('entry_id').references(() => mealPlanEntries.id),
    servingsCooked: integer('servings_cooked').notNull(),
    cookedAt: timestamp('cooked_at', { withTimezone: true }).notNull().defaultNow(),
    kcalPerServingSnapshot: qty('kcal_per_serving_snapshot'),
    pantryDeductions: jsonb('pantry_deductions').notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb('warnings').notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index('cooking_log_household_cooked_idx').on(t.householdId, t.cookedAt)],
)

export type MealPlanEntry = typeof mealPlanEntries.$inferSelect
export type PantryItemRow = typeof pantryItems.$inferSelect
export type PlanProposal = typeof planProposals.$inferSelect
