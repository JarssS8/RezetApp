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
  // Ruling W3-R7/W3-R8: el hueco explícito solo tiene sentido al cocinar "a
  // pelo" desde una receta (§9.5 paso 1). Con entryId la entrada YA tiene
  // hueco fijado en el plan; admitir `slot` ahí sugeriría, engañosamente, que
  // se puede cambiar el hueco de una entrada existente al cocinarla.
  .refine((v) => !(v.slot && v.entryId), { message: 'slot solo se admite al cocinar desde receta sin entryId' })
export type LogCookedInput = z.infer<typeof LogCookedSchema>
