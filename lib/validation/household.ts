import { z } from 'zod'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { isLanOrLoopbackHost, isPrivateOrReservedHost } from '@/lib/net-hosts'
import { AiProviderSchema, IdSchema, LocaleSchema, ThemeSchema, UnitSystemSchema } from './common'

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

// Tarea 24: ajustes de IA por hogar. apiKey opcional: ausente o '' mantiene la
// clave guardada; null la borra (ver lib/services/ai-settings.ts).
const AI_BASE_URL_MAX_LEN = 512

// Valida y normaliza la URL de un servidor de IA (SSRF, W2-R-fix-1 / fix 12 de la
// revisión final): http solo si el host es la propia máquina o de la LAN (ahí vive
// llama-server/Ollama en modo autoalojado); https a cualquier host que NO sea
// privado/reservado (un proveedor "en la nube" que en realidad apunte a la LAN del
// propio servidor sería igual de SSRF que un http sin restringir). Cualquier otro
// esquema (ftp:, javascript:, file:…) se rechaza; si la URL llevaba
// usuario/contraseña, se quitan antes de guardarla.
export function normalizeAiBaseUrl(raw: string): string | null {
  if (raw.length === 0 || raw.length > AI_BASE_URL_MAX_LEN) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.protocol === 'http:' && !isLanOrLoopbackHost(url.hostname)) return null
  if (url.protocol === 'https:' && isPrivateOrReservedHost(url.hostname)) return null
  url.username = ''
  url.password = ''
  return url.toString()
}

export const AiBaseUrlSchema = z
  .string()
  .max(AI_BASE_URL_MAX_LEN)
  .nullable()
  .transform((v, ctx) => {
    if (v === null) return null
    const normalized = normalizeAiBaseUrl(v)
    if (normalized === null) {
      ctx.addIssue({ code: 'custom', message: 'URL de servidor de IA no permitida' })
      return z.NEVER
    }
    return normalized
  })

export const AiSettingsSchema = z.strictObject({
  provider: AiProviderSchema,
  model: z.string().max(80).nullable(),
  baseUrl: AiBaseUrlSchema,
  apiKey: z.string().max(200).nullable().optional(),
  monthlyCapCents: z.number().int().min(0).max(100_000),
  structuredOutput: z.boolean(),
  // Precio en céntimos por millón de tokens (in/out) que el hogar declara para un
  // proveedor sin catálogo (p. ej. anthropic, W2-R3): sin ellos, lib/ai/budget.ts
  // contabiliza el coste como 0 y el tope mensual nunca salta para ese proveedor.
  // Opcional: un cliente que no los mande (REST/MCP antiguos) no borra lo guardado.
  priceInCentsPerMtok: z.number().nonnegative().nullable().optional(),
  priceOutCentsPerMtok: z.number().nonnegative().nullable().optional(),
})

// Tarea 30: ajustes de ShopList por hogar. secret opcional: ausente o ''
// mantiene el guardado; null lo borra (mismo patrón que apiKey de arriba, ver
// lib/services/shoplist-settings.ts). fnUrl exige https: la Edge Function de
// ShopList es pública, a diferencia del servidor de IA que sí puede ser local.
export const ShoplistSettingsSchema = z.strictObject({
  fnUrl: z
    .url()
    .nullable()
    .refine((v) => v === null || v.startsWith('https://'), { message: 'La URL de ShopList debe ser https' })
    // fix 12 de la revisión final: https no bastaba por sí solo (SSRF) — un fnUrl
    // que resuelva a la propia LAN/loopback del servidor es igual de peligroso
    // que un http sin restringir, aunque lleve el esquema "seguro".
    .refine((v) => v === null || !isPrivateOrReservedHost(new URL(v).hostname), { message: 'La URL de ShopList no puede apuntar a un host privado' }),
  secret: z.string().max(200).nullable().optional(),
  listToken: z.string().max(120).nullable(),
})
