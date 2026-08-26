export type { Ctx, Db } from '@/lib/auth/ctx'

export class ServiceError extends Error {
  constructor(public readonly code: 'not_found' | 'forbidden' | 'conflict' | 'validation', message: string) {
    super(message)
  }
}

// Violación de restricción única de Postgres (23505): p. ej. una passkey ya registrada
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === '23505'
}
