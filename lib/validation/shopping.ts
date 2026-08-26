import { z } from 'zod'
import { BaseUnitSchema, DateRangeSchema, IdSchema } from './common'

export const ShoppingGenerateSchema = DateRangeSchema
export const ShoppingLineSchema = z.strictObject({ foodId: IdSchema.nullable(), name: z.string().min(1), quantity: z.number().positive().nullable(), unit: BaseUnitSchema.nullable(), unresolved: z.boolean() })
export const ShoppingPushSchema = z.strictObject({ lines: z.array(ShoppingLineSchema).min(1).max(500) })
