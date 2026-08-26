import { z } from 'zod'
import { BaseUnitSchema, DateSchema, IdSchema } from './common'

export const PantryLocationSchema = z.enum(['fridge', 'freezer', 'pantry'])
export const PantryItemInputSchema = z.strictObject({
  foodId: IdSchema,
  quantity: z.number().min(0),
  unit: BaseUnitSchema,
  location: PantryLocationSchema.default('pantry'),
  expiresAt: DateSchema.nullable().optional(),
  openedAt: z.iso.datetime().nullable().optional(),
})
export type PantryItemInput = z.infer<typeof PantryItemInputSchema>
export const PantryAdjustSchema = z.strictObject({ itemId: IdSchema, delta: z.number().refine((d) => d !== 0, { message: 'delta ≠ 0' }) })
export type PantryAdjust = z.infer<typeof PantryAdjustSchema>
export const PantryQuerySchema = z.object({ location: PantryLocationSchema.optional(), expiresBefore: DateSchema.optional(), q: z.string().max(80).optional() })
export type PantryQuery = z.infer<typeof PantryQuerySchema>
