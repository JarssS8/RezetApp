export type { Ctx, Db } from '@/lib/auth/ctx'

// Los tres últimos son específicos del autorrelleno por reglas
// (proposeWeekFromRules, fix 4 de la revisión final W4): antes los tres
// fallaban con 'validation' indistinguible, y la interfaz no podía explicar
// cuál de los tres motivos era.
export class ServiceError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'forbidden'
      | 'conflict'
      | 'validation'
      | 'no_candidates'
      | 'allergen_conflict'
      | 'rules_unsatisfiable',
    message: string,
  ) {
    super(message)
  }
}

// Violación de restricción única de Postgres (23505): p. ej. una passkey ya registrada
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === '23505'
}
