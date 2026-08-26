import { z } from 'zod'
import { IdSchema, LocaleSchema } from './common'

export const RegisterBodySchema = z.strictObject({ displayName: z.string().trim().min(1).max(60), inviteToken: z.string().optional(), locale: LocaleSchema.default('es') })
export const HouseholdUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  defaultServings: z.number().int().min(1).max(50).optional(),
  expiryAlertDays: z.number().int().min(0).max(60).optional(),
})
export const ALLERGENS = ['gluten', 'lactose', 'egg', 'fish', 'shellfish', 'nuts', 'peanut', 'soy', 'sesame', 'celery', 'mustard', 'sulphites', 'lupin', 'mollusc'] as const
export const MemberUpdateSchema = z.strictObject({ userId: IdSchema, allergens: z.array(z.enum(ALLERGENS)).optional(), dietaryFlags: z.array(z.string().max(30)).max(10).optional() })
export const UserPrefsSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(60).optional(),
  locale: LocaleSchema.optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  accent: z.enum(['huerta', 'miel', 'tomate', 'pistacho', 'higo', 'berenjena', 'arandano', 'canela']).optional(),
})
export const DeleteHouseholdSchema = z.strictObject({ confirmName: z.string().min(1) })
