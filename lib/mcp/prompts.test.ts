// Test de unidad (sin base de datos): los prompts son texto fijo, no
// consultan servicios. connectedClient/fakeCtx siguen el mismo patrón que
// server.test.ts.
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

async function connectedClient(ctx: McpCtx): Promise<Client> {
  const server = buildMcpServer(ctx)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

describe('prompts MCP', () => {
  it('expone los cuatro prompts con sus argumentos', async () => {
    const client = await connectedClient(fakeCtx({ scopes: ['recipes:read'] }))
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name).sort()).toEqual(['cooking_session', 'nutrition_summary', 'plan_week', 'prepare_shopping'])
    expect(prompts.find((p) => p.name === 'cooking_session')?.arguments?.map((a) => a.name)).toEqual(['recipe'])
    expect(prompts.find((p) => p.name === 'nutrition_summary')?.arguments?.map((a) => a.name)).toEqual(['range'])
    await client.close()
  })

  it('plan_week recuerda las barandillas: caducidades, no repetir, alérgenos y aprobación', async () => {
    const client = await connectedClient(fakeCtx({ scopes: ['recipes:read'] }))
    const { messages } = await client.getPrompt({ name: 'plan_week', arguments: {} })
    const text = messages.map((m) => (typeof m.content === 'object' && 'text' in m.content ? m.content.text : '')).join(' ')
    for (const idea of ['caduc', 'repet', 'alérgen', 'aprob']) expect(text.toLowerCase()).toContain(idea)
    await client.close()
  })

  it('con el hogar en inglés, títulos y contenido en inglés', async () => {
    const client = await connectedClient(fakeCtx({ locale: 'en', scopes: ['recipes:read'] }))
    const { prompts } = await client.listPrompts()
    // Los nombres NO se traducen: son el identificador del protocolo.
    expect(prompts.map((p) => p.name).sort()).toEqual(['cooking_session', 'nutrition_summary', 'plan_week', 'prepare_shopping'])
    expect(prompts.find((p) => p.name === 'plan_week')?.title).toBe('Plan the week')

    const got = await client.getPrompt({ name: 'plan_week', arguments: {} })
    const text = got.messages[0]?.content
    expect(text?.type).toBe('text')
    expect(text && text.type === 'text' ? text.text : '').toContain('get_household_context')
    expect(text && text.type === 'text' ? text.text : '').not.toMatch(/Planifica/)
    await client.close()
  })

  it('con el hogar en español sigue en español y con los mismos argumentos', async () => {
    const client = await connectedClient(fakeCtx({ locale: 'es', scopes: ['recipes:read'] }))
    const { prompts } = await client.listPrompts()
    expect(prompts.find((p) => p.name === 'plan_week')?.title).toBe('Planificar la semana')
    expect(prompts.find((p) => p.name === 'cooking_session')?.arguments?.map((a) => a.name)).toEqual(['recipe'])
    await client.close()
  })
})
