import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { type Ctx, ServiceError } from './ctx'

// Resumen de una passkey para ajustes: nunca incluye la clave pública ni el
// contador, que no le sirven de nada a la UI y no deberían salir de la capa
// de servicio (dato sensible para verificación).
export interface PasskeySummary {
  credentialId: string
  name: string | null
  deviceType: string
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

// Las passkeys son del usuario, no del hogar: un token de API (sin userId)
// no tiene ninguna que gestionar.
function requireUserId(ctx: Ctx): string {
  if (!ctx.userId) throw new ServiceError('forbidden', 'Solo una sesión de usuario tiene passkeys')
  return ctx.userId
}

export async function listPasskeys(ctx: Ctx): Promise<PasskeySummary[]> {
  const userId = requireUserId(ctx)
  const rows = await ctx.db
    .select({
      credentialId: schema.webauthnCredentials.credentialId,
      name: schema.webauthnCredentials.name,
      deviceType: schema.webauthnCredentials.deviceType,
      backedUp: schema.webauthnCredentials.backedUp,
      createdAt: schema.webauthnCredentials.createdAt,
      lastUsedAt: schema.webauthnCredentials.lastUsedAt,
    })
    .from(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, userId))
    .orderBy(schema.webauthnCredentials.createdAt)
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null }))
}

async function requireOwnCredential(ctx: Ctx, userId: string, credentialId: string): Promise<void> {
  const [row] = await ctx.db
    .select({ credentialId: schema.webauthnCredentials.credentialId })
    .from(schema.webauthnCredentials)
    .where(and(eq(schema.webauthnCredentials.credentialId, credentialId), eq(schema.webauthnCredentials.userId, userId)))
    .limit(1)
  if (!row) throw new ServiceError('not_found', 'Passkey no encontrada')
}

export async function renamePasskey(ctx: Ctx, credentialId: string, name: string): Promise<void> {
  const userId = requireUserId(ctx)
  await requireOwnCredential(ctx, userId, credentialId)
  await ctx.db.update(schema.webauthnCredentials).set({ name }).where(and(eq(schema.webauthnCredentials.credentialId, credentialId), eq(schema.webauthnCredentials.userId, userId)))
}

// No se puede quedar un usuario sin ninguna passkey (no hay recuperación por
// email, spec §6): en transacción para que dos borrados concurrentes de las
// dos últimas passkeys no dejen la cuenta sin acceso.
export async function removePasskey(ctx: Ctx, credentialId: string): Promise<void> {
  const userId = requireUserId(ctx)
  await requireOwnCredential(ctx, userId, credentialId)
  await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select({ credentialId: schema.webauthnCredentials.credentialId })
      .from(schema.webauthnCredentials)
      .where(eq(schema.webauthnCredentials.userId, userId))
      .for('update')
    if (rows.length <= 1) throw new ServiceError('conflict', 'No puedes eliminar tu única passkey')
    await tx.delete(schema.webauthnCredentials).where(and(eq(schema.webauthnCredentials.credentialId, credentialId), eq(schema.webauthnCredentials.userId, userId)))
  })
}
