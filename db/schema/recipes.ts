import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { baseUnitEnum, difficultyEnum, tsvector } from './_types'
import { foods, tags } from './foods'
import { households } from './households'

const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    title: text('title').notNull(),
    description: text('description'),
    servingsBase: integer('servings_base').notNull().default(2),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    difficulty: difficultyEnum('difficulty'),
    sourceUrl: text('source_url'),
    imageUrls: text('image_urls').array().notNull().default(sql`'{}'::text[]`),
    notes: text('notes'),
    yieldGrams: qty('yield_grams'),
    kcalPerServing: qty('kcal_per_serving'),
    proteinPerServing: qty('protein_per_serving'),
    carbsPerServing: qty('carbs_per_serving'),
    fatPerServing: qty('fat_per_serving'),
    fiberPerServing: qty('fiber_per_serving'),
    kcal100g: qty('kcal_100g'),
    nutritionIsEstimated: boolean('nutrition_is_estimated').notNull().default(false),
    timesCooked: integer('times_cooked').notNull().default(0),
    lastCookedAt: timestamp('last_cooked_at', { withTimezone: true }),
    // Índice full-text bilingüe: una columna generada no puede depender del locale del hogar
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, '')) || to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))`,
    ),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipes_household_idx').on(t.householdId),
    index('recipes_search_idx').using('gin', t.searchVector),
  ],
)

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id').references(() => foods.id),
    rawText: text('raw_text').notNull(),
    quantity: qty('quantity'), // base; null si no hay conversión
    unit: baseUnitEnum('unit'),
    displayQuantity: qty('display_quantity'),
    displayUnit: text('display_unit'), // id canónico de units-data ('tsp', 'cup', 'clove'…) o null
    preparation: text('preparation'),
    groupLabel: text('group_label'),
    stepIndex: integer('step_index'),
    scalesLinearly: boolean('scales_linearly').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('recipe_ingredients_recipe_idx').on(t.recipeId),
    index('recipe_ingredients_food_idx').on(t.foodId),
    index('recipe_ingredients_raw_text_idx').using('gin', sql`to_tsvector('simple', ${t.rawText})`),
  ],
)

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    text: text('text').notNull(),
    timerSeconds: integer('timer_seconds'),
    imageUrl: text('image_url'),
  },
  (t) => [index('recipe_steps_recipe_idx').on(t.recipeId)],
)

export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
)

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    name: text('name').notNull(),
    query: jsonb('query').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('collections_household_idx').on(t.householdId)],
)

export type Recipe = typeof recipes.$inferSelect
export type RecipeIngredient = typeof recipeIngredients.$inferSelect
export type RecipeStep = typeof recipeSteps.$inferSelect
