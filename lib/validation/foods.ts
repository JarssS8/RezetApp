import { z } from 'zod'
import { BaseUnitSchema, LocaleSchema, PaginationSchema } from './common'
import { ALLERGENS } from './household'

export const FoodInputSchema = z.strictObject({
  nameEs: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().max(60)).max(10).default([]),
  defaultUnit: BaseUnitSchema.default('g'),
  kcal100g: z.number().min(0).nullable().optional(),
  protein100g: z.number().min(0).nullable().optional(),
  carbs100g: z.number().min(0).nullable().optional(),
  fat100g: z.number().min(0).nullable().optional(),
  fiber100g: z.number().min(0).nullable().optional(),
  barcode: z.string().regex(/^\d{8,14}$/).nullable().optional(),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  gramsPerCup: z.number().positive().nullable().optional(),
  gramsPerTbsp: z.number().positive().nullable().optional(),
  gramsPerUnit: z.number().positive().nullable().optional(),
  densityGPerMl: z.number().positive().nullable().optional(),
  seasonalMonths: z.array(z.number().int().min(1).max(12)).default([]),
})
export type FoodInput = z.infer<typeof FoodInputSchema>
export const FoodSearchSchema = PaginationSchema.extend({ q: z.string().trim().min(1).max(80), locale: LocaleSchema.default('es') })
export const BarcodeSchema = z.string().regex(/^\d{8,14}$/)

// Corrección manual de un alimento (gana a cualquier fuente, §9.4). Todo opcional: se actualiza solo lo enviado.
export const FoodCorrectionSchema = FoodInputSchema.partial().strict()
export type FoodCorrection = z.infer<typeof FoodCorrectionSchema>
