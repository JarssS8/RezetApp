import { z } from 'zod'

export const IdSchema = z.uuid()
export const LocaleSchema = z.enum(['es', 'en'])
export const BaseUnitSchema = z.enum(['g', 'ml', 'ud'])
export const DateSchema = z.iso.date() // YYYY-MM-DD
export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

const MAX_RANGE_DAYS = 92
export const DateRangeSchema = z
  .strictObject({ from: DateSchema, to: DateSchema })
  .refine((r) => r.from <= r.to, { message: 'from debe ser ≤ to' })
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= MAX_RANGE_DAYS, { message: `Máximo ${MAX_RANGE_DAYS} días` })

export const PaginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) })

export const ErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) })
export type ErrorBody = z.infer<typeof ErrorBodySchema>
