import type { Db } from '@/db/types'

export type { Db }

// Duplicado deliberado de lib/domain/types.ts::Locale: las fronteras de
// eslint-boundaries prohíben que lib/auth importe de lib/domain (ver
// lib/validation/tokens.ts para el mismo patrón con API_SCOPES).
export type Locale = 'es' | 'en'

// Contexto de toda petición autenticada (páginas, REST y tokens API).
// Vive en lib/auth porque los guards lo necesitan sin depender de
// lib/services (que sí puede depender de lib/auth, nunca al revés).
// Exactamente uno de userId/apiTokenId es no nulo.
export interface Ctx {
  db: Db
  householdId: string
  userId: string | null
  apiTokenId: string | null
  role: 'owner' | 'member' | null // null cuando actúa un token
  locale: Locale
  // Permisos del token que actúa; [] cuando es una sesión (la sesión no tiene
  // scopes: manda el rol). Ver lib/validation/tokens.ts::API_SCOPES.
  scopes: string[]
}
