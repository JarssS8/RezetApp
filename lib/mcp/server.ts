import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { APP_NAME, APP_VERSION } from '@/lib/app-version'
import { ApiAuthError } from '@/lib/auth/api-tokens'
import { authenticateMcp, type McpCtx } from './auth'
import { registerHouseholdTools } from './tools/household'
import { registerRecipeTools } from './tools/recipes'

// Instrucciones del sistema del servidor MCP (docs/05-MCP.md, "La regla de
// oro"): el modelo decide qué hacer, el servidor decide cuánto. Neutrales,
// sin nombre de asistente ni de proveedor.
const INSTRUCTIONS =
  'Recetario del hogar. Los resultados de las herramientas son la única fuente de verdad: no afirmes datos que no hayas leído de una herramienta.'

// Andamiaje de las tareas siguientes de esta pista (22-28): cada una sustituye
// su stub por el import de su propio fichero en lib/mcp/tools/*. Se dejan aquí,
// sin registrar nada, solo para que buildMcpServer ya declare la forma final.
/* eslint-disable @typescript-eslint/no-unused-vars -- parámetros que las tareas 22-28 usarán al reemplazar cada stub */
function registerPlanTools(_server: McpServer, _ctx: McpCtx): boolean {
  return false
}
function registerPantryTools(_server: McpServer, _ctx: McpCtx): boolean {
  return false
}
function registerShoppingTools(_server: McpServer, _ctx: McpCtx): boolean {
  return false
}
function registerCookingTools(_server: McpServer, _ctx: McpCtx): boolean {
  return false
}
function registerFoodTools(_server: McpServer, _ctx: McpCtx): boolean {
  return false
}
function registerPrompts(_server: McpServer): void {}
function registerHouseholdResource(_server: McpServer, _ctx: McpCtx): void {}
/* eslint-enable @typescript-eslint/no-unused-vars */

// Un McpServer nuevo por petición (transporte stateless, ver handleMcpRequest):
// no hay estado que compartir entre llamadas, así que registrar las
// herramientas aquí es barato.
//
// Cada registerXTools comprueba sus propios scopes y decide si registra
// alguna herramienta (devuelve si lo hizo); con un token sin scopes (o sin
// ninguno relevante) no se registra ninguna. ctx.mcpProfile ("basic"/"full")
// distingue perfil básico y completo por herramienta (docs/05-MCP.md,
// "Barandillas de seguridad"): las 12 herramientas llegan en las tareas 22-28.
export function buildMcpServer(ctx: McpCtx): McpServer {
  const server = new McpServer({ name: APP_NAME, version: APP_VERSION }, { instructions: INSTRUCTIONS })
  const registered = [
    registerHouseholdTools(server, ctx),
    registerRecipeTools(server, ctx),
    registerPlanTools(server, ctx),
    registerPantryTools(server, ctx),
    registerShoppingTools(server, ctx),
    registerCookingTools(server, ctx),
    registerFoodTools(server, ctx),
  ]
  registerPrompts(server)
  registerHouseholdResource(server, ctx)
  // McpServer solo instala su propio handler de tools/list (y declara la
  // capacidad) al registrar la primera herramienta con .registerTool(): si
  // ningún registerXTools llegó a registrar nada (token sin scopes
  // relevantes), un cliente que llame a tools/list recibiría "Method not
  // found" en vez de una lista vacía. Se declara aquí, a mano, solo en ese caso.
  if (!registered.some(Boolean)) {
    server.server.registerCapabilities({ tools: {} })
    server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }))
  }
  return server
}

function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

// Handler HTTP del endpoint MCP: autentica por Bearer, construye un servidor y
// un transporte nuevos para esta única petición (stateless: sessionIdGenerator
// undefined) y delega en el SDK. enableJsonResponse evita el modo SSE por
// defecto del transporte: con un servidor nuevo por petición no hay conexión
// que mantener viva para empujar mensajes adicionales, así que la respuesta es
// JSON puro y el transporte puede cerrarse en cuanto se resuelve.
//
// GET (stream SSE independiente) y DELETE (cierre de sesión) solo tienen
// sentido con un transporte con estado que sobrevive entre peticiones; aquí
// cada petición crea y cierra el suyo, así que no hay nada que un GET pudiera
// empujar ni ninguna sesión que un DELETE pudiera cerrar. Se rechazan con 405
// antes de autenticar y sin llegar a construir servidor ni transporte.
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    return methodNotAllowed()
  }
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
