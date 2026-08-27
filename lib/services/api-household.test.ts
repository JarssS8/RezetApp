import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { generateApiToken, hashToken } from '@/lib/auth/api-tokens'
import { GET as getHousehold } from '@/app/api/v1/household/route'

// Fuera de webpack, "server-only" resuelve siempre a su índice, que lanza a
// propósito (marca de RSC, no comprobación real): sin esto, cualquier test que
// importe una ruta -que arrastra lib/auth/guards.ts- rompería en el import.
vi.mock('server-only', () => ({}))
// La ruta usa el singleton @/db (no ctx.db de getTestDb()): sin cabecera
// authorization apunta ahí, así que aquí también debe mirar a la BD de tests.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
// cookies() de Next exige un contexto de petición real (AsyncLocalStorage) que
// no existe al llamar a la ruta directamente en un test: sin él lanza en vez
// de devolver una jarra vacía. Se sustituye por una sin cookies, que es
// justo lo que produciría una petición real sin cabecera Cookie.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

let db: TestDb, householdId: string, token: string

async function makeToken(scopes: string[]): Promise<string> {
  const plain = generateApiToken()
  await db.insert(schema.apiTokens).values({ householdId, userId, name: 'test', tokenHash: hashToken(plain), scopes, mcpProfile: 'basic' })
  return plain
}
function req(url: string, bearer?: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${url}`, { ...init, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(init.headers ?? {}) } })
}
let userId: string

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [h] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  householdId = h!.id
  userId = u!.id
  await db.insert(schema.householdMembers).values({ householdId, userId, role: 'owner' })
  token = await makeToken(['household:read'])
})

describe('GET /api/v1/household', () => {
  it('devuelve el hogar con el scope correcto', async () => {
    const res = await getHousehold(req('/api/v1/household', token))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: householdId, name: 'Casa' })
  })
  it('sin token: 401 con la forma de error del spec', async () => {
    const res = await getHousehold(req('/api/v1/household'))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } })
  })
  it('con un token sin ese scope: 403', async () => {
    const other = await makeToken(['recipes:read'])
    const res = await getHousehold(req('/api/v1/household', other))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } })
  })
})
