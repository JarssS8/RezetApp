import { ServiceError } from '@/lib/services/ctx'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message?: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}
export function fail<T = never>(code: string, message?: string): ActionResult<T> {
  return message === undefined ? { ok: false, code } : { ok: false, code, message }
}
// Traduce errores de servicio a resultado; cualquier otro error se registra y sale como 'unknown'
export function fromError<T = never>(e: unknown): ActionResult<T> {
  if (e instanceof ServiceError) return fail(e.code, e.message)
  console.error('[action]', e)
  return fail('unknown')
}
