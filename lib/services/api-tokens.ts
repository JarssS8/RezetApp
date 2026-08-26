import { and, desc, eq } from 'drizzle-orm'
import type { z } from 'zod'
import * as schema from '@/db/schema'
import { generateApiToken, hashToken } from '@/lib/auth/api-tokens'
import { ApiTokenCreateSchema } from '@/lib/validation/tokens'
import { type Ctx, ServiceError } from './ctx'

export type ApiTokenCreate = z.infer<typeof ApiTokenCreateSchema>

export interface ApiTokenSummary {
  id: string
  name: string
  scopes: string[]
  mcpProfile: 'basic' | 'full'
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

// Solo el propietario gestiona tokens de API (crear/revocar); cualquier
// miembro puede listarlos para saber qué hay conectado al hogar.
function requireOwner(ctx: Ctx): void {
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario gestiona los tokens de API')
}

export async function listApiTokens(ctx: Ctx): Promise<ApiTokenSummary[]> {
  const rows = await ctx.db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.householdId, ctx.householdId))
    .orderBy(desc(schema.apiTokens.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scopes: r.scopes,
    mcpProfile: r.mcpProfile,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  }))
}

// El token en claro solo se devuelve aquí, en la creación; a partir de este
// punto solo existe su hash sha256 en base de datos (lib/auth/api-tokens).
export async function createApiToken(ctx: Ctx, input: ApiTokenCreate): Promise<{ id: string; token: string }> {
  requireOwner(ctx)
  if (!ctx.userId) throw new ServiceError('forbidden', 'Solo una sesión de usuario puede crear tokens')
  const token = generateApiToken()
  const [row] = await ctx.db
    .insert(schema.apiTokens)
    .values({ householdId: ctx.householdId, userId: ctx.userId, name: input.name, tokenHash: hashToken(token), scopes: input.scopes, mcpProfile: input.mcpProfile })
    .returning({ id: schema.apiTokens.id })
  if (!row) throw new ServiceError('conflict', 'No se pudo crear el token')
  return { id: row.id, token }
}

export async function revokeApiToken(ctx: Ctx, id: string): Promise<void> {
  requireOwner(ctx)
  const [row] = await ctx.db
    .select({ id: schema.apiTokens.id, revokedAt: schema.apiTokens.revokedAt })
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.householdId, ctx.householdId)))
    .limit(1)
  // Un id de otro hogar se trata igual que uno inexistente: no se filtra su existencia.
  if (!row) throw new ServiceError('not_found', 'Token no encontrado')
  if (row.revokedAt) return // idempotente: ya estaba revocado
  await ctx.db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(eq(schema.apiTokens.id, id))
}
