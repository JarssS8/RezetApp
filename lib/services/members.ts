import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import * as schema from '@/db/schema'
import type { MemberUpdateSchema } from '@/lib/validation/household'
import { invalidateHousehold } from '@/lib/cache/tags'
import { type Ctx, ServiceError } from './ctx'
import { getHouseholdOverview } from './households'

export type MemberUpdate = z.infer<typeof MemberUpdateSchema>

export interface MemberSummary {
  userId: string
  displayName: string
  role: 'owner' | 'member'
  allergens: string[]
  dietaryFlags: string[]
}

// Reutiliza getHouseholdOverview: la lista de miembros ya sale de ahí para
// GET /api/v1/household y para este panel, sin duplicar la consulta.
export async function listMembers(ctx: Ctx): Promise<MemberSummary[]> {
  const overview = await getHouseholdOverview(ctx)
  return overview.members
}

// Quita duplicados y, en las preferencias libres, recorta espacios y descarta
// las que queden vacías tras el recorte.
function dedupe(items: readonly string[]): string[] {
  return Array.from(new Set(items))
}
function cleanDietaryFlags(items: readonly string[]): string[] {
  return dedupe(items.map((s) => s.trim()).filter((s) => s.length > 0))
}

async function requireMembership(ctx: Ctx, userId: string): Promise<{ role: 'owner' | 'member' }> {
  const [row] = await ctx.db
    .select({ role: schema.householdMembers.role })
    .from(schema.householdMembers)
    .where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.userId, userId)))
    .limit(1)
  if (!row) throw new ServiceError('not_found', 'Miembro no encontrado')
  return row
}

// El propietario edita a cualquiera; un miembro solo puede editar sus
// propios alérgenos y preferencias.
export async function updateMember(ctx: Ctx, input: MemberUpdate): Promise<void> {
  const isSelf = ctx.userId !== null && ctx.userId === input.userId
  if (ctx.role !== 'owner' && !isSelf) throw new ServiceError('forbidden', 'Solo puedes editar tus propios datos')
  await requireMembership(ctx, input.userId)
  const patch: Partial<{ allergens: string[]; dietaryFlags: string[] }> = {}
  if (input.allergens !== undefined) patch.allergens = dedupe(input.allergens)
  if (input.dietaryFlags !== undefined) patch.dietaryFlags = cleanDietaryFlags(input.dietaryFlags)
  if (Object.keys(patch).length === 0) return
  await ctx.db
    .update(schema.householdMembers)
    .set(patch)
    .where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.userId, input.userId)))
  invalidateHousehold(ctx.householdId, ['settings'])
}

// Expulsa a un miembro del hogar: en una sola transacción se borra su
// membresía, sus sesiones de este hogar y sus tokens de API de este hogar
// (regla W1 C1: quien deja de ser miembro pierde también el acceso por
// REST/MCP, no solo por navegador).
export async function removeMember(ctx: Ctx, userId: string): Promise<void> {
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario puede expulsar miembros')
  if (ctx.userId !== null && ctx.userId === userId) throw new ServiceError('forbidden', 'No puedes expulsarte a ti mismo; usa salir del hogar')
  await ctx.db.transaction(async (tx) => {
    const [member] = await tx
      .select({ role: schema.householdMembers.role })
      .from(schema.householdMembers)
      .where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ServiceError('not_found', 'Miembro no encontrado')
    if (member.role === 'owner') {
      // FOR UPDATE bloquea las filas de propietarios hasta que termine la
      // transacción: dos expulsiones concurrentes sobre los dos últimos
      // propietarios no pueden leer ambas "quedan 2" y dejar el hogar sin nadie.
      const owners = await tx
        .select({ userId: schema.householdMembers.userId })
        .from(schema.householdMembers)
        .where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.role, 'owner')))
        .for('update')
      if (owners.length <= 1) throw new ServiceError('conflict', 'El último propietario no puede ser expulsado')
    }
    await tx.delete(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.userId, userId)))
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.householdId, ctx.householdId), eq(schema.sessions.userId, userId)))
    await tx.delete(schema.apiTokens).where(and(eq(schema.apiTokens.householdId, ctx.householdId), eq(schema.apiTokens.userId, userId)))
  })
  invalidateHousehold(ctx.householdId, ['settings'])
}
