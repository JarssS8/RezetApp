import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { ApiScope } from '@/db/schema'
import type { Ctx, Db } from './ctx'

export class ApiAuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message)
  }
}

export function generateApiToken(): string {
  return `rz_${randomBytes(32).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// RFC 6750: el esquema "Bearer" no distingue mayúsculas ("bearer", "BEARER")
const BEARER = /^bearer\s+(.+)$/i

export async function authenticateApiToken(db: Db, authorization: string | undefined, requiredScopes: ApiScope[]): Promise<Ctx & { mcpProfile: 'basic' | 'full' }> {
  const token = BEARER.exec(authorization ?? '')?.[1]?.trim() ?? null
  if (!token || !token.startsWith('rz_')) throw new ApiAuthError(401, 'Token ausente')
  // El join con household_members es la garantía de que un token deja de valer
  // en cuanto su dueño sale del hogar: sin membresía, el token no existe (401),
  // igual que uno desconocido — no se distingue para no filtrar información.
  const [row] = await db
    .select({ token: schema.apiTokens, locale: schema.users.locale })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .innerJoin(
      schema.householdMembers,
      and(eq(schema.householdMembers.userId, schema.apiTokens.userId), eq(schema.householdMembers.householdId, schema.apiTokens.householdId)),
    )
    .where(and(eq(schema.apiTokens.tokenHash, hashToken(token)), isNull(schema.apiTokens.revokedAt)))
    .limit(1)
  if (!row) throw new ApiAuthError(401, 'Token inválido o revocado')
  const missing = requiredScopes.filter((s) => !row.token.scopes.includes(s))
  if (missing.length) throw new ApiAuthError(403, `Faltan permisos: ${missing.join(', ')}`)
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.token.id))
  return {
    db,
    householdId: row.token.householdId,
    userId: null,
    apiTokenId: row.token.id,
    role: null,
    locale: row.locale === 'en' ? 'en' : 'es',
    mcpProfile: row.token.mcpProfile,
    scopes: row.token.scopes,
  }
}
