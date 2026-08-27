// Ayudantes compartidos por las pruebas de rutas REST (lib/services/api-*.test.ts),
// fijados en la Tarea 13 (lib/services/api-household.test.ts) y extraídos aquí
// para que el resto de recursos (recetas, plan, despensa...) no los dupliquen.
import * as schema from '@/db/schema'
import type { ApiScope } from '@/db/schema'
import type { TestDb } from '@/db/test/setup'
import { generateApiToken, hashToken } from '@/lib/auth/api-tokens'

// Estado mutable que cada fichero de test rellena en su beforeAll/beforeEach
// (db tras getTestDb(), householdId/userId tras insertar las filas de cada caso).
export interface ApiTestState {
  db: TestDb
  householdId: string
  userId: string
}

// Crea un token de API con los scopes indicados para el hogar/usuario actuales de `state`.
export function createMakeToken(state: ApiTestState) {
  return async function makeToken(scopes: ApiScope[]): Promise<string> {
    const plain = generateApiToken()
    await state.db.insert(schema.apiTokens).values({ householdId: state.householdId, userId: state.userId, name: 'test', tokenHash: hashToken(plain), scopes, mcpProfile: 'basic' })
    return plain
  }
}

export function req(url: string, bearer?: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${url}`, { ...init, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(init.headers ?? {}) } })
}
