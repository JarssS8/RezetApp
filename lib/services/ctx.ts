import type { Locale } from '@/lib/domain/types'
import type { Db } from '@/db/types'

export type { Db }

// Contexto de toda operación de servicio. Exactamente uno de userId/apiTokenId es no nulo.
export interface Ctx {
  db: Db
  householdId: string
  userId: string | null
  apiTokenId: string | null
  role: 'owner' | 'member' | null // null cuando actúa un token
  locale: Locale
}

export class ServiceError extends Error {
  constructor(public readonly code: 'not_found' | 'forbidden' | 'conflict' | 'validation', message: string) {
    super(message)
  }
}
