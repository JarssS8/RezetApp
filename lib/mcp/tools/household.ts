import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as schema from '@/db/schema'
import { getHouseholdOverview } from '@/lib/services/households'
import type { McpCtx } from '../auth'

const RECENTLY_COOKED_LIMIT = 5

const GetHouseholdContextInputSchema = z.strictObject({})

// No hay servicio de cocina todavía en W2 (docs/07-ROADMAP.md): la consulta es
// barata y vive aquí en vez de en lib/services porque solo la necesita esta
// herramienta. Solo recetas con al menos un cocinado (recipes.last_cooked_at),
// más recientes primero.
async function getRecentlyCooked(ctx: McpCtx): Promise<{ id: string; title: string; lastCookedAt: string }[]> {
  const rows = await ctx.db
    .select({ id: schema.recipes.id, title: schema.recipes.title, lastCookedAt: schema.recipes.lastCookedAt })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt), isNotNull(schema.recipes.lastCookedAt)))
    .orderBy(desc(schema.recipes.lastCookedAt))
    .limit(RECENTLY_COOKED_LIMIT)
  return rows.map((r) => ({ id: r.id, title: r.title, lastCookedAt: (r.lastCookedAt as Date).toISOString() }))
}

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
        const recentlyCooked = await getRecentlyCooked(ctx)
        return { content: [{ type: 'text', text: JSON.stringify({ ...overview, recentlyCooked }) }] }
      } catch {
        // Nunca se filtra el mensaje real del servicio ni una traza: el modelo
        // solo necesita saber que la herramienta falló.
        return { isError: true, content: [{ type: 'text', text: 'No se pudo obtener el contexto del hogar.' }] }
      }
    },
  )
  return true
}
