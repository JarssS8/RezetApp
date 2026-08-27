// Prueba de humo del riesgo §18.3: ¿un modelo de 4B–8B elige bien entre estas
// herramientas? Se salta siempre salvo que haya un servidor local levantado,
// así que nunca corre en CI. Para ejecutarla:
//   llama-server -m qwen3-8b-q4_k_m.gguf -ngl 99 -c 8192 -fa --jinja --port 8080
//   AI_LOCAL_BASE_URL=http://localhost:8080/v1 AI_LOCAL_TEST_MODEL=qwen3-8b pnpm exec vitest run --project db lib/mcp/local-model.db.test.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import { buildMcpServer } from '@/lib/mcp/server'
import { API_SCOPES } from '@/lib/validation/tokens'

const baseUrl = process.env.AI_LOCAL_BASE_URL
const model = process.env.AI_LOCAL_TEST_MODEL

// Forma que espera el campo "tools" del endpoint /chat/completions de la API
// de OpenAI (y de cualquier servidor compatible: llama-server, Ollama, LM
// Studio…). No es la del propio protocolo MCP: tools/list de MCP y "function
// calling" de OpenAI describen lo mismo con formas distintas.
interface OpenAiToolDefinition {
  type: 'function'
  function: { name: string; description?: string; parameters: unknown }
}

interface ChatCompletionsResponse {
  choices: { message: { tool_calls?: { function: { name: string } }[] } }[]
}

describe.skipIf(!baseUrl || !model)('modelo local contra las herramientas MCP', () => {
  let db: TestDb
  let householdId: string

  beforeAll(async () => {
    db = await getTestDb()
  })
  afterAll(closeTestDb)

  beforeEach(async () => {
    await truncateAll(db)
    const [household] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
    if (!household) throw new Error('seed')
    householdId = household.id
  })

  // tools/list del servidor MCP, traducido al formato de la API OpenAI. Un
  // token con todos los scopes y perfil completo para que el modelo vea el
  // catálogo entero: lo que se prueba aquí es su criterio para elegir, no las
  // barandillas de scopes (ya cubiertas en tools.db.test.ts).
  async function toolDefinitionsForModel(): Promise<OpenAiToolDefinition[]> {
    const ctx: McpCtx = { db, householdId, userId: null, apiTokenId: null, role: null, locale: 'es', scopes: [...API_SCOPES], mcpProfile: 'full' }
    const server = buildMcpServer(ctx)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'local-model-test', version: '0.0.0' })
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    const { tools } = await client.listTools()
    await client.close()
    return tools.map((tool) => ({
      type: 'function',
      function:
        tool.description !== undefined
          ? { name: tool.name, description: tool.description, parameters: tool.inputSchema }
          : { name: tool.name, parameters: tool.inputSchema },
    }))
  }

  it('elige get_pantry (no search_recipes) para "qué tengo en la nevera"', async () => {
    const tools = await toolDefinitionsForModel()
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '¿Qué tengo en la nevera que caduque esta semana?' }], tools, tool_choice: 'auto' }),
    })
    const body = (await res.json()) as ChatCompletionsResponse
    expect(body.choices[0]?.message.tool_calls?.[0]?.function.name).toBe('get_pantry')
  }, 120_000)

  it('elige set_meal_plan (no update_meal_plan_entry) para "planifícame la semana"', async () => {
    const tools = await toolDefinitionsForModel()
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Planifícame las cenas de la semana que viene' }], tools, tool_choice: 'auto' }),
    })
    const body = (await res.json()) as ChatCompletionsResponse
    const called = body.choices[0]?.message.tool_calls?.map((c) => c.function.name) ?? []
    // Puede empezar por get_household_context o get_pantry (es lo que dice el
    // prompt plan_week); lo que NO puede es tocar una entrada suelta.
    expect(called).not.toContain('update_meal_plan_entry')
  }, 120_000)
})
