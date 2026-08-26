import { z } from 'zod'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
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
// host.docker.internal: como llama-server/Ollama suelen correr en el host
// desde un contenedor Docker de la propia app.
const PRIVATE_AI_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

function isPrivateIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const octets = [m[1], m[2], m[3], m[4]].map(Number)
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b] = octets
  if (a === undefined || b === undefined) return false
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

// URL.hostname devuelve las IPv6 entre corchetes ('[::1]'); hay que quitarlos
// antes de comparar contra la lista de hosts locales.
function stripIPv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

// El parser de URL normaliza cualquier IPv4-mapped ('::ffff:127.0.0.1',
// '::ffff:192.168.1.20'…) a su forma hexadecimal ('::ffff:7f00:1',
// '::ffff:c0a8:114'…); hay que deshacerla para poder aplicar las mismas
// reglas de host local/LAN que a una IPv4 normal.
function ipv4MappedToDotted(hostname: string): string | null {
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname)
  if (!m || m[1] === undefined || m[2] === undefined) return null
  const g1 = Number.parseInt(m[1], 16)
  const g2 = Number.parseInt(m[2], 16)
  return [(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff].join('.')
}

function isAllowedLocalAiHost(hostname: string): boolean {
  const h = stripIPv6Brackets(hostname).toLowerCase()
  if (PRIVATE_AI_HOSTS.has(h) || h === '::1') return true
  const mapped = ipv4MappedToDotted(h)
  if (mapped !== null) return mapped === '127.0.0.1' || isPrivateIPv4(mapped)
  return isPrivateIPv4(h)
}

// Valida y normaliza la URL de un servidor de IA (SSRF, W2-R-fix-1): https a
// cualquier host, o http solo si el host es la propia máquina o de la LAN
// (ahí vive llama-server/Ollama en modo autoalojado). Cualquier otro esquema
// (ftp:, javascript:, file:…) o un http a un host público se rechaza; si la
// URL llevaba usuario/contraseña, se quitan antes de guardarla.
export function normalizeAiBaseUrl(raw: string): string | null {
  if (raw.length === 0 || raw.length > AI_BASE_URL_MAX_LEN) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.protocol === 'http:' && !isAllowedLocalAiHost(url.hostname)) return null
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
})
