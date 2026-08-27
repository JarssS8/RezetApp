import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listCookingLog } from '@/lib/services/cooking'
import { getHouseholdOverview } from '@/lib/services/households'
import { expiringPantry } from '@/lib/services/pantry'
import type { McpCtx } from './auth'
import { hasScope } from './guards'
import { RECENT_LIMIT } from './tools/household'

// Una sola lectura al empezar la conversación y el modelo ya sabe con quién
// habla (docs/05-MCP.md). Mismo contenido que get_household_context más lo que
// caduca: un recurso se adjunta al contexto, una herramienta se llama.
export function registerHouseholdResource(server: McpServer, ctx: McpCtx): void {
  if (!hasScope(ctx, 'household:read')) return
  server.registerResource(
    'household-context',
    'household://context',
    { title: 'Contexto del hogar', description: 'Miembros, alérgenos, raciones por defecto, lo que caduca pronto y lo cocinado recientemente.', mimeType: 'application/json' },
    async (uri) => {
      const overview = await getHouseholdOverview(ctx)
      const [expiring, cooked] = await Promise.all([expiringPantry(ctx, overview.expiryAlertDays), listCookingLog(ctx, RECENT_LIMIT)])
      const data = {
        household: { id: overview.id, name: overview.name, defaultServings: overview.defaultServings, expiryAlertDays: overview.expiryAlertDays },
        members: overview.members,
        expiringSoon: expiring.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, daysToExpiry: i.daysToExpiry })),
        recentlyCooked: cooked.map((c) => ({ title: c.title, servings: c.servingsCooked, cookedAt: c.cookedAt, warningCount: c.warningCount })),
      }
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data) }] }
    },
  )
}
