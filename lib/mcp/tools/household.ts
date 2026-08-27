import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getHouseholdOverview } from '@/lib/services/households'
import { recentlyCooked } from '@/lib/services/recipes'
import type { McpCtx } from '../auth'

const RECENTLY_COOKED_LIMIT = 5

const GetHouseholdContextInputSchema = z.strictObject({})

// Registra get_household_context solo si el token trae household:read. El
// perfil "full" (ctx.mcpProfile) no añade nada aquí en W2: docs/05-MCP.md
// describe 12 herramientas del perfil básico, de las que esta oleada solo
// trae 3; "full" queda listo para cuando existan las demás.
export function registerHouseholdTools(server: McpServer, ctx: McpCtx): boolean {
  if (!ctx.scopes.includes('household:read')) return false
  server.registerTool(
    'get_household_context',
    {
      title: 'Contexto del hogar',
      description:
        'Miembros, alérgenos, raciones por defecto y lo cocinado recientemente. Llámala una vez al empezar. No la uses para buscar recetas.',
      inputSchema: GetHouseholdContextInputSchema,
    },
    async () => {
      try {
        const overview = await getHouseholdOverview(ctx)
        const recentlyCookedRecipes = await recentlyCooked(ctx, RECENTLY_COOKED_LIMIT)
        return { content: [{ type: 'text', text: JSON.stringify({ ...overview, recentlyCooked: recentlyCookedRecipes }) }] }
      } catch (e) {
        // El modelo solo necesita saber que la herramienta falló; el mensaje
        // real del servicio o su traza van al log del servidor, no a la respuesta.
        console.error('[mcp]', e)
        return { isError: true, content: [{ type: 'text', text: 'No se pudo obtener el contexto del hogar.' }] }
      }
    },
  )
  return true
}
