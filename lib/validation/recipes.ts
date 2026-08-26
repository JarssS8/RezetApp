import { z } from 'zod'
import { BaseUnitSchema, DifficultySchema, IdSchema, PaginationSchema } from './common'

export const RecipeIngredientInputSchema = z.strictObject({
  rawText: z.string().trim().min(1).max(200),
  foodId: IdSchema.nullable().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: BaseUnitSchema.nullable().optional(),
  displayQuantity: z.number().nonnegative().nullable().optional(),
  displayUnit: z.string().max(20).nullable().optional(),
  preparation: z.string().max(120).nullable().optional(),
  groupLabel: z.string().max(60).nullable().optional(),
  stepIndex: z.number().int().min(0).nullable().optional(),
  scalesLinearly: z.boolean().default(true),
})
export const RecipeStepInputSchema = z.strictObject({ text: z.string().trim().min(1).max(2000), timerSeconds: z.number().int().positive().nullable().optional(), imageUrl: z.string().max(300).nullable().optional() })
export const RecipeInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  servingsBase: z.number().int().min(1).max(100),
  prepMinutes: z.number().int().min(0).nullable().optional(),
  cookMinutes: z.number().int().min(0).nullable().optional(),
  difficulty: DifficultySchema.nullable().optional(),
  sourceUrl: z.url().nullable().optional(),
  imageUrls: z.array(z.string().max(300)).max(10).default([]),
  notes: z.string().max(4000).nullable().optional(),
  yieldGrams: z.number().positive().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).default([]),
  ingredients: z.array(RecipeIngredientInputSchema).max(100),
  steps: z.array(RecipeStepInputSchema).max(100),
})
export type RecipeInput = z.infer<typeof RecipeInputSchema>

export const RecipeSearchSchema = PaginationSchema.extend({
  q: z.string().max(120).optional(),
  tags: z.array(z.string()).max(20).optional(),
  maxMinutes: z.coerce.number().int().min(0).optional(),
  difficulty: DifficultySchema.optional(),
  hasIngredients: z.array(IdSchema).max(20).optional(), // que la receta contenga estos alimentos
  onlyWithPantry: z.coerce.boolean().optional(), // "tengo los ingredientes"
  sort: z.enum(['relevance', 'recent', 'most_cooked', 'title']).default('relevance'),
})
export const RecipeImportSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), url: z.url() }),
  z.strictObject({ kind: z.literal('text'), text: z.string().min(10).max(20_000) }),
  z.strictObject({ kind: z.literal('image'), uploadId: z.string().max(200) }),
])
export const RecipeGetQuerySchema = z.object({ servings: z.coerce.number().int().min(1).max(100).optional() })
