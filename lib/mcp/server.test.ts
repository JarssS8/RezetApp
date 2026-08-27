// Test de unidad (sin base de datos): construye el servidor con un contexto
// ficticio y habla con él por el transporte en memoria del SDK, sin pasar por
// HTTP ni por autenticación (eso se cubre en server.db.test.ts).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import type { Db } from '@/db/types'
import type { McpCtx } from './auth'
import { buildMcpServer } from './server'

function fakeCtx(overrides: Partial<McpCtx> = {}): McpCtx {
  return {
    db: {} as unknown as Db,
    householdId: 'household-1',
    userId: null,
    apiTokenId: 'token-1',
    role: null,
    locale: 'es',
    scopes: [],
    mcpProfile: 'basic',
    ...overrides,
  }
}

describe('buildMcpServer', () => {
  it('se identifica como rezetapp al inicializar', async () => {
    const server = buildMcpServer(fakeCtx())
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    expect(client.getServerVersion()?.name).toBe('rezetapp')
    await client.close()
    await server.close()
  })

  it('todavía no expone ninguna herramienta (las añade la Tarea 39)', async () => {
    const server = buildMcpServer(fakeCtx())
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    const { tools } = await client.listTools()
    expect(tools).toEqual([])
    await client.close()
    await server.close()
  })
})
