import { z } from 'zod'
import { BaseUnitSchema, DateRangeSchema, IdSchema } from './common'

export const ShoppingGenerateSchema = DateRangeSchema
// pantryUnmatched (tarea 30): añadido para que el esquema coincida con
// lib/domain/types.ts::ShoppingLine — sin él, una línea del cliente no podía
// validarse antes de enviarla a pushShoppingAction.
export const ShoppingLineSchema = z.strictObject({
  foodId: IdSchema.nullable(),
  name: z.string().min(1),
  quantity: z.number().positive().nullable(),
  unit: BaseUnitSchema.nullable(),
  unresolved: z.boolean(),
  pantryUnmatched: z.boolean(),
})
export const ShoppingPushSchema = z.strictObject({ lines: z.array(ShoppingLineSchema).min(1).max(500) })
