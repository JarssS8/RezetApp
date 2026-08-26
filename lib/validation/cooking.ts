import { z } from 'zod'
import { DateSchema, IdSchema, MealSlotSchema } from './common'

export const LogCookedSchema = z
  .strictObject({
    entryId: IdSchema.optional(),
    recipeId: IdSchema.optional(),
    servingsCooked: z.number().int().min(1).max(100),
    slot: MealSlotSchema.optional(), // solo cuando se cocina desde receta sin entrada
    leftovers: z.strictObject({ servings: z.number().int().min(1).max(100), date: DateSchema, slot: MealSlotSchema }).optional(),
  })
  .refine((v) => v.entryId || v.recipeId, { message: 'entryId o recipeId' })
export type LogCookedInput = z.infer<typeof LogCookedSchema>
