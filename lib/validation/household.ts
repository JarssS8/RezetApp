import { z } from 'zod'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { IdSchema, LocaleSchema, ThemeSchema, UnitSystemSchema } from './common'

export const RegisterBodySchema = z.strictObject({ displayName: z.string().trim().min(1).max(60), inviteToken: z.string().optional(), locale: LocaleSchema.default('es') })

// Tarea 21: endpoints de registro/login por passkey
export const RegisterOptionsBodySchema = z.strictObject({ displayName: z.string().trim().min(1).max(60), inviteToken: z.string().optional() })
export const RegisterVerifyBodySchema = z.strictObject({
  challengeId: IdSchema,
  displayName: z.string().trim().min(1).max(60),
  inviteToken: z.string().optional(),
  locale: LocaleSchema.default('es'),
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === 'object' && v !== null && 'id' in v),
})
// Tarea 36: alta de una passkey adicional desde ajustes (sesión ya autenticada)
export const PasskeyVerifyBodySchema = z.strictObject({
  challengeId: IdSchema,
  name: z.string().trim().max(60).nullable().transform((v) => (v === '' ? null : v)),
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === 'object' && v !== null && 'id' in v),
})
export const PasskeyRenameSchema = z.strictObject({ credentialId: z.string().trim().min(1).max(1024), name: z.string().trim().min(1).max(60) })
export const PasskeyIdSchema = z.string().trim().min(1).max(1024)
export const LoginVerifyBodySchema = z.strictObject({
  challengeId: IdSchema,
  inviteToken: z.string().optional(),
  response: z.custom<AuthenticationResponseJSON>((v) => typeof v === 'object' && v !== null && 'id' in v),
})
export const InviteAcceptBodySchema = z.strictObject({ token: z.string().min(1) })
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
  units: UnitSystemSchema.optional(),
  theme: ThemeSchema.optional(),
  accent: z.enum(['huerta', 'miel', 'tomate', 'pistacho', 'higo', 'berenjena', 'arandano', 'canela']).optional(),
})
export const DeleteHouseholdSchema = z.strictObject({ confirmName: z.string().min(1) })
