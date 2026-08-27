import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getHouseholdOverview } from '@/lib/services/households'
import { recentlyCooked } from '@/lib/services/recipes'
import type { McpCtx } from '../auth'
import { guarded, hasScope } from '../guards'

// Compartida con resources.ts (household://context enseña el mismo "lo
// cocinado recientemente" que esta herramienta): un solo número, para que no
// puedan volver a divergir.
export const RECENT_LIMIT = 5

const GetHouseholdContextInputSchema = z.strictObject({})

// Registra get_household_context solo si el token trae household:read. El
// perfil "full" (ctx.mcpProfile) no añade nada aquí en W2: docs/05-MCP.md
// describe 12 herramientas del perfil básico, de las que esta oleada solo
// trae 3; "full" queda listo para cuando existan las demás.
export function registerHouseholdTools(server: McpServer, ctx: McpCtx): boolean {
  if (!hasScope(ctx, 'household:read')) return false
  server.registerTool(
    'get_household_context',
    {
      title: 'Contexto del hogar',
      description:
        'Miembros, alérgenos, raciones por defecto y lo cocinado recientemente. Llámala una vez al empezar. No la uses para buscar recetas.',
      inputSchema: GetHouseholdContextInputSchema,
    },
    guarded('No se pudo obtener el contexto del hogar.', async () => {
      const overview = await getHouseholdOverview(ctx)
      const recentlyCookedRecipes = await recentlyCooked(ctx, RECENT_LIMIT)
      return { ...overview, recentlyCooked: recentlyCookedRecipes }
    }),
  )
  return true
}
