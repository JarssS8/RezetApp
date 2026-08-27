import { ServiceError } from '@/lib/services/ctx'

// Contrato de toda acción de W2 (congelado desde esta pista: (a)/(c)/(d)/(e)/(f)/(g) lo consumen tal cual).
export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}
export function fail<T = never>(code: string, message: string): ActionResult<T> {
  return { ok: false, code, message }
}
// Traduce errores de servicio a resultado; cualquier otro error se registra y sale como 'internal'
export function fromError<T = never>(e: unknown): ActionResult<T> {
  if (e instanceof ServiceError) return fail(e.code, e.message)
  console.error('[action]', e)
  return fail('internal', 'Error interno')
}

// Códigos que puede traer `ActionResult.code` en toda la app (ServiceError +
// los `fail(...)` propios de cada acción, incluido AiFailureCode). Cada uno
// tiene su traducción en el namespace 'errors' (messages/*/errors.json); un
// código fuera de esta lista (o un `internal` genérico) usa 'internal' como
// reserva. Regla I3 de la revisión W2: nunca se pinta `result.message` -texto
// crudo de ServiceError o zod- en la interfaz, siempre por código. La lista es
// `as const` (no un `Set<string>`) para que el tipo de retorno sea la unión
// literal de claves y `useTranslations('errors')` (global.d.ts, tipado con
// messages/es/errors.json) siga comprobando la clave en vez de aceptar
// cualquier `string`.
const KNOWN_ERROR_CODES = [
  'not_found',
  'forbidden',
  'conflict',
  'validation',
  'internal',
  'too_large',
  'unsupported',
  'shoplist',
  'no_provider',
  'ai_budget',
  'ai_unsupported',
  'ai_output',
  'no_candidates',
  'allergen_conflict',
  'rules_unsatisfiable',
] as const
type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number]
const KNOWN_ERROR_CODE_SET: ReadonlySet<string> = new Set(KNOWN_ERROR_CODES)

// Clave del namespace 'errors' (sin prefijo: se usa con `useTranslations('errors')`,
// igual que el resto de la app) para un código de ActionResult/AiResult.
export function actionErrorKey(code: string): KnownErrorCode {
  return (KNOWN_ERROR_CODE_SET.has(code) ? code : 'internal') as KnownErrorCode
}
