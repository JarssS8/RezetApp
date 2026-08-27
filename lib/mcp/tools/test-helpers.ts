import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { McpCtx } from '@/lib/mcp/auth'
import { buildMcpServer } from '@/lib/mcp/server'

// Ayudantes compartidos por los *.db.test.ts de lib/mcp/tools (W2 los definía
// por duplicado en tools.db.test.ts). mcpCtxOf no vive aquí: cada fichero de
// test siembra su propio household/usuarios y necesita cerrar sobre su propio
// `db`/`householdId`.

// Cliente y servidor conectados por un par de transportes en memoria (sin red,
// sin HTTP): igual que el SDK recomienda para probar herramientas MCP.
export async function connectedClient(ctx: McpCtx): Promise<Client> {
  const server = buildMcpServer(ctx)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

export interface ToolTextResult {
  content: { type: string; text: string }[]
  isError?: boolean
}

// client.callTool() tipa su valor de vuelta como la unión con CreateTaskResult
// (soporte de tareas) sin tener en cuenta el resultSchema que se le pase; aquí
// ninguna herramienta usa tareas, así que el resultado siempre trae "content".
export async function callTool(client: Client, params: { name: string; arguments: Record<string, unknown> }): Promise<ToolTextResult> {
  return (await client.callTool(params, CallToolResultSchema)) as unknown as ToolTextResult
}

export function textOf(result: ToolTextResult): string {
  const first = result.content[0]
  if (!first) throw new Error('Respuesta sin contenido')
  return first.text
}
