// Test con base de datos real: handleMcpRequest usa `db` de '@/db' (lee
// DATABASE_URL), no getTestDb() (DATABASE_URL_TEST) — fijamos DATABASE_URL
// antes del primer acceso, igual que en db/index.test.ts.
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import { generateApiToken, hashToken } from '@/lib/auth/api-tokens'
import { handleMcpRequest } from './server'

beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

let db: TestDb
let householdId: string
let userId: string

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  const [h] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
  if (!u || !h) throw new Error('seed')
  userId = u.id
  householdId = h.id
  await db.insert(schema.householdMembers).values({ householdId, userId, role: 'owner' })
})

function mcpRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const initializeBody = {
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } },
}

describe('handleMcpRequest (POST /mcp)', () => {
  it('con token válido responde 200 y serverInfo.name === rezetapp', async () => {
    const token = generateApiToken()
    await db.insert(schema.apiTokens).values({ householdId, userId, name: 'agente', tokenHash: hashToken(token), scopes: [] })

    const res = await handleMcpRequest(mcpRequest(initializeBody, token))

    expect(res.status).toBe(200)
    const json = (await res.json()) as { result: { serverInfo: { name: string } } }
    expect(json.result.serverInfo.name).toBe('rezetapp')
  })

  it('sin token responde 401 con error JSON-RPC -32001 y WWW-Authenticate', async () => {
    const res = await handleMcpRequest(mcpRequest(initializeBody))

    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer')
    const json = (await res.json()) as { jsonrpc: string; error: { code: number } }
    expect(json.jsonrpc).toBe('2.0')
    expect(json.error.code).toBe(-32001)
  })

  it('con token inválido responde 401', async () => {
    const res = await handleMcpRequest(mcpRequest(initializeBody, 'rz_no-existe'))
    expect(res.status).toBe(401)
  })

  it('sin scopes, tools/list devuelve una lista vacía', async () => {
    const token = generateApiToken()
    await db.insert(schema.apiTokens).values({ householdId, userId, name: 'agente', tokenHash: hashToken(token), scopes: [] })
    await handleMcpRequest(mcpRequest(initializeBody, token))

    const res = await handleMcpRequest(
      mcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, token),
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { result: { tools: unknown[] } }
    expect(json.result.tools).toEqual([])
  })

  it('GET responde 405 con Allow: POST, sin autenticar (sin token ni servidor)', async () => {
    const res = await handleMcpRequest(new Request('http://localhost/mcp', { method: 'GET' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('DELETE responde 405, sin autenticar (sin token ni servidor)', async () => {
    const res = await handleMcpRequest(new Request('http://localhost/mcp', { method: 'DELETE' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })
})
