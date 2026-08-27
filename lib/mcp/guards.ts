import type { McpCtx } from './auth'

export function hasScope(ctx: McpCtx, ...scopes: string[]): boolean {
  return scopes.every((s) => ctx.scopes.includes(s))
}

// Perfil "completo" (api_tokens.mcp_profile): añade editar y borrar. El básico
// solo crea (docs/05-MCP.md, "Barandillas de seguridad").
export function isFull(ctx: McpCtx): boolean {
  return ctx.mcpProfile === 'full'
}

export function toolJson(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

export function toolError(message: string) {
  return { isError: true as const, content: [{ type: 'text' as const, text: message }] }
}

// Un modelo no necesita -ni debe ver- el mensaje interno de un ServiceError:
// puede llevar ids de otro hogar o detalles de la base de datos. Cada
// herramienta declara su propio texto de fallo y este envoltorio se encarga
// del resto, para que ninguna se olvide del try/catch.
export function guarded<A>(message: string, fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return toolJson(await fn(args))
    } catch (e) {
      console.error('[mcp]', e)
      return toolError(message)
    }
  }
}
