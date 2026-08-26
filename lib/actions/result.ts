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
