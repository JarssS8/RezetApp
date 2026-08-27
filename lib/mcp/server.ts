import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ApiAuthError } from '@/lib/auth/api-tokens'
import { authenticateMcp, type McpCtx } from './auth'

// Instrucciones del sistema del servidor MCP (docs/05-MCP.md, "La regla de
// oro"): el modelo decide qué hacer, el servidor decide cuánto. Neutrales,
// sin nombre de asistente ni de proveedor.
const INSTRUCTIONS =
  'Recetario del hogar. Los resultados de las herramientas son la única fuente de verdad: no afirmes datos que no hayas leído de una herramienta.'

// Un McpServer nuevo por petición (transporte stateless, ver handleMcpRequest):
// no hay estado que compartir entre llamadas, así que registrar las
// herramientas aquí es barato.
//
// Task 39 añade el registro real de herramientas según ctx.scopes/ctx.mcpProfile
// (perfiles "basic"/"full" de docs/05-MCP.md); de momento el servidor no expone
// ninguna.
export function buildMcpServer(ctx: McpCtx): McpServer {
  const server = new McpServer({ name: 'rezetapp', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  void ctx
  // McpServer solo declara la capacidad "tools" (y por tanto responde a
  // tools/list) en cuanto se registra alguna herramienta con .tool()/
  // .registerTool(); sin ninguna, un cliente que llame a tools/list recibe
  // "Method not found". Se declara aquí explícitamente, vacía, para que el
  // contrato del endpoint sea estable desde ya: Task 39 sustituye este
  // handler por el registro real de herramientas según ctx.scopes/mcpProfile.
  server.server.registerCapabilities({ tools: {} })
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }))
  return server
}

// Handler HTTP del endpoint MCP: autentica por Bearer, construye un servidor y
// un transporte nuevos para esta única petición (stateless: sessionIdGenerator
// undefined) y delega en el SDK. enableJsonResponse evita el modo SSE por
// defecto del transporte: con un servidor nuevo por petición no hay conexión
// que mantener viva para empujar mensajes adicionales, así que la respuesta es
// JSON puro y el transporte puede cerrarse en cuanto se resuelve.
export async function handleMcpRequest(request: Request): Promise<Response> {
  let ctx: McpCtx
  try {
    ctx = await authenticateMcp(request)
  } catch (e) {
    const status = e instanceof ApiAuthError ? e.status : 500
    const message = e instanceof Error ? e.message : 'Error'
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32001, message }, id: null },
      { status, headers: status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {} },
    )
  }
  const server = buildMcpServer(ctx)
  // Sin sessionIdGenerator: modo stateless (sin él, la propiedad queda
  // simplemente ausente en vez de "presente pero undefined", que es lo que
  // exactOptionalPropertyTypes exige aquí).
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    // Stateless: un servidor y un transporte por petición, se descartan al terminar.
    await transport.close().catch(() => undefined)
  }
}
