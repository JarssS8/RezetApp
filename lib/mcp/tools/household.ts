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

// Registra get_household_context solo si el token trae household:read. Es una
// herramienta del perfil básico: el perfil completo no añade nada aquí (las
// herramientas que sí dependen del perfil viven en recipes/plan/pantry/foods).
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
