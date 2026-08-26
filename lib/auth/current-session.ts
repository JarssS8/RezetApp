import { cookies } from 'next/headers'
import { getDb } from '@/db'
import { SESSION_COOKIE } from './cookies'
import { resolveSession, type SessionWithUser } from './session'

// Helper mínimo para leer la sesión actual desde una ruta de `app/`, que no
// puede importar `db` directamente (límite de eslint-plugin-boundaries).
// La tarea 20 (guards) se encargará de fusionar esto en `lib/auth/guards.ts`.
export async function getCurrentSession(): Promise<SessionWithUser | null> {
  const jar = await cookies()
  return resolveSession(getDb(), jar.get(SESSION_COOKIE)?.value)
}
