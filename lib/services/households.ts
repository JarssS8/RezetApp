import { randomBytes } from 'node:crypto'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { saveCredential, type VerifiedCredential } from '@/lib/auth/webauthn'
import type { Locale } from '@/lib/domain/types'
import { type Ctx, type Db, ServiceError } from './ctx'

const INVITE_HOURS = 24

export async function createUserWithHousehold(db: Db, input: { displayName: string; credential: VerifiedCredential; locale: Locale }): Promise<{ userId: string; householdId: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ displayName: input.displayName, locale: input.locale }).returning()
    const [household] = await tx.insert(schema.households).values({ name: `Casa de ${input.displayName}` }).returning()
    if (!user || !household) throw new ServiceError('conflict', 'No se pudo crear el usuario')
    await tx.insert(schema.householdMembers).values({ householdId: household.id, userId: user.id, role: 'owner' })
    await saveCredential(tx, user.id, input.credential, null)
    return { userId: user.id, householdId: household.id }
  })
}

export async function listHouseholdsOf(db: Db, userId: string): Promise<{ id: string; name: string; role: 'owner' | 'member' }[]> {
  return db
    .select({ id: schema.households.id, name: schema.households.name, role: schema.householdMembers.role })
    .from(schema.householdMembers)
    .innerJoin(schema.households, eq(schema.households.id, schema.householdMembers.householdId))
    .where(eq(schema.householdMembers.userId, userId))
    .orderBy(schema.householdMembers.joinedAt)
}

export async function createInvite(ctx: Ctx): Promise<{ token: string; url: string; expiresAt: Date }> {
  if (ctx.role !== 'owner' || !ctx.userId) throw new ServiceError('forbidden', 'Solo el propietario puede invitar')
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3_600_000)
  await ctx.db.insert(schema.householdInvites).values({ token, householdId: ctx.householdId, createdBy: ctx.userId, expiresAt })
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return { token, url: `${base}/invite/${token}`, expiresAt }
}

export async function getInvite(db: Db, token: string): Promise<{ householdId: string; householdName: string; invitedBy: string } | null> {
  const [row] = await db
    .select({ householdId: schema.households.id, householdName: schema.households.name, invitedBy: schema.users.displayName })
    .from(schema.householdInvites)
    .innerJoin(schema.households, eq(schema.households.id, schema.householdInvites.householdId))
    .innerJoin(schema.users, eq(schema.users.id, schema.householdInvites.createdBy))
    .where(and(eq(schema.householdInvites.token, token), isNull(schema.householdInvites.usedAt), gt(schema.householdInvites.expiresAt, new Date())))
    .limit(1)
  return row ?? null
}

async function consumeInvite(tx: Db, token: string, userId: string): Promise<string> {
  const [inv] = await tx
    .update(schema.householdInvites)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.householdInvites.token, token), isNull(schema.householdInvites.usedAt), gt(schema.householdInvites.expiresAt, new Date())))
    .returning({ householdId: schema.householdInvites.householdId })
  if (!inv) throw new ServiceError('not_found', 'Invitación inválida o caducada')
  await tx.insert(schema.householdMembers).values({ householdId: inv.householdId, userId, role: 'member' }).onConflictDoNothing()
  return inv.householdId
}

export async function acceptInvite(db: Db, input: { token: string; userId: string }): Promise<{ householdId: string }> {
  return db.transaction(async (tx) => ({ householdId: await consumeInvite(tx, input.token, input.userId) }))
}

// Registro desde un enlace de invitación: el usuario entra como member y NO recibe hogar propio
export async function registerViaInvite(db: Db, input: { token: string; displayName: string; credential: VerifiedCredential; locale: Locale }): Promise<{ userId: string; householdId: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ displayName: input.displayName, locale: input.locale }).returning()
    if (!user) throw new ServiceError('conflict', 'No se pudo crear el usuario')
    await saveCredential(tx, user.id, input.credential, null)
    const householdId = await consumeInvite(tx, input.token, user.id)
    return { userId: user.id, householdId }
  })
}

export async function leaveHousehold(ctx: Ctx): Promise<void> {
  if (!ctx.userId) throw new ServiceError('forbidden', 'Solo un usuario puede salir del hogar')
  await ctx.db.transaction(async (tx) => {
    const owners = await tx.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.role, 'owner')))
    if (ctx.role === 'owner' && owners.length <= 1) throw new ServiceError('conflict', 'El último propietario no puede salir; borra el hogar o nombra otro propietario')
    await tx.delete(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.userId, ctx.userId ?? '')))
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.householdId, ctx.householdId), eq(schema.sessions.userId, ctx.userId ?? '')))
  })
}

// Borrado explícito y confirmado. Sin CASCADE en el esquema: el orden de aquí es el contrato.
export async function deleteHousehold(ctx: Ctx, confirmName: string): Promise<void> {
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario puede borrar el hogar')
  await ctx.db.transaction(async (tx) => {
    const [h] = await tx.select().from(schema.households).where(eq(schema.households.id, ctx.householdId)).limit(1)
    if (!h) throw new ServiceError('not_found', 'Hogar no encontrado')
    if (h.name !== confirmName) throw new ServiceError('validation', 'El nombre no coincide')
    const hid = ctx.householdId
    const recipeIds = (await tx.select({ id: schema.recipes.id }).from(schema.recipes).where(eq(schema.recipes.householdId, hid))).map((r) => r.id)
    await tx.delete(schema.cookingLog).where(eq(schema.cookingLog.householdId, hid))
    await tx.delete(schema.planProposals).where(eq(schema.planProposals.householdId, hid))
    await tx.delete(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, hid))
    await tx.delete(schema.pantryItems).where(eq(schema.pantryItems.householdId, hid))
    if (recipeIds.length) {
      await tx.delete(schema.recipeTags).where(inArray(schema.recipeTags.recipeId, recipeIds))
      await tx.delete(schema.recipeIngredients).where(inArray(schema.recipeIngredients.recipeId, recipeIds))
      await tx.delete(schema.recipeSteps).where(inArray(schema.recipeSteps.recipeId, recipeIds))
    }
    await tx.delete(schema.recipes).where(eq(schema.recipes.householdId, hid))
    await tx.delete(schema.collections).where(eq(schema.collections.householdId, hid))
    await tx.delete(schema.tags).where(eq(schema.tags.householdId, hid))
    await tx.delete(schema.foods).where(eq(schema.foods.householdId, hid))
    await tx.delete(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, hid))
    await tx.delete(schema.apiTokens).where(eq(schema.apiTokens.householdId, hid))
    await tx.delete(schema.householdInvites).where(eq(schema.householdInvites.householdId, hid))
    await tx.delete(schema.sessions).where(eq(schema.sessions.householdId, hid))
    await tx.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, hid))
    await tx.delete(schema.households).where(eq(schema.households.id, hid))
  })
}
