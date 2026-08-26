import { sql } from 'drizzle-orm'
import { boolean, index, integer, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { baseUnitEnum, foodSourceEnum } from './_types'
import { households } from './households'

const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').references(() => households.id), // null = global
    nameEs: text('name_es').notNull(),
    nameEn: text('name_en').notNull(),
    // sin acentos ni mayúsculas; el índice GIN trigram se añade en la migración manual de la Tarea 5
    searchNameEs: text('search_name_es').notNull(),
    searchNameEn: text('search_name_en').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    defaultUnit: baseUnitEnum('default_unit').notNull().default('g'),
    kcal100g: qty('kcal_100g'),
    protein100g: qty('protein_100g'),
    carbs100g: qty('carbs_100g'),
    fat100g: qty('fat_100g'),
    fiber100g: qty('fiber_100g'),
    source: foodSourceEnum('source').notNull().default('manual'),
    sourceRef: text('source_ref'),
    barcode: text('barcode'),
    allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
    gramsPerCup: qty('grams_per_cup'),
    gramsPerTbsp: qty('grams_per_tbsp'),
    gramsPerUnit: qty('grams_per_unit'),
    densityGPerMl: qty('density_g_per_ml'),
    seasonalMonths: integer('seasonal_months').array().notNull().default(sql`'{}'::int[]`),
    isEstimated: boolean('is_estimated').notNull().default(false),
    mergedIntoId: uuid('merged_into_id'), // referencia a foods.id; FK autorreferente se añade en la migración manual de la Tarea 5
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('foods_household_idx').on(t.householdId),
    index('foods_barcode_idx').on(t.barcode),
    index('foods_search_es_trgm_idx').using('gin', t.searchNameEs.op('gin_trgm_ops')),
    index('foods_search_en_trgm_idx').using('gin', t.searchNameEn.op('gin_trgm_ops')),
    uniqueIndex('foods_source_ref_uidx').on(t.source, t.sourceRef).where(sql`source_ref IS NOT NULL AND household_id IS NULL`),
  ],
)

export const unitAliases = pgTable(
  'unit_aliases',
  {
    alias: text('alias').notNull(),
    locale: text('locale').notNull(),
    unit: baseUnitEnum('unit').notNull(),
    factorToBase: qty('factor_to_base').notNull(),
  },
  // (alias, locale) es la clave natural: clave primaria, no un índice único aparte
  (t) => [primaryKey({ columns: [t.alias, t.locale] })],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').references(() => households.id), // null = global (seed)
    name: text('name').notNull(), // español
    nameEn: text('name_en'), // null en etiquetas creadas por el hogar sin traducir (regla W1-R19)
    slug: text('slug').notNull(),
    parentId: uuid('parent_id'),
  },
  (t) => [
    index('tags_household_idx').on(t.householdId),
    // NULLS NOT DISTINCT no es expresable en el builder de Drizzle 0.45;
    // la Tarea 5 reescribe este índice en SQL manual para tratar los NULL de household_id como iguales.
    uniqueIndex('tags_household_slug_uidx').on(t.householdId, t.slug),
  ],
)

export type Food = typeof foods.$inferSelect
export type Tag = typeof tags.$inferSelect
