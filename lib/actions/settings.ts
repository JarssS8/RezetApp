'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prefsCookieOptions, prefsCookieValue, SESSION_COOKIE } from '@/lib/auth/cookies'
import { requireHousehold } from '@/lib/auth/guards'
import { destroySession, switchHousehold } from '@/lib/auth/session'
import { PREFS_COOKIE } from '@/lib/prefs'
import { createApiToken, revokeApiToken } from '@/lib/services/api-tokens'
import { createInvite, deleteHousehold, leaveHousehold, updateHousehold, type HouseholdSummary, type HouseholdUpdate } from '@/lib/services/households'
import { removeMember, updateMember, type MemberUpdate } from '@/lib/services/members'
import { updateUserPrefs, type UserPrefs } from '@/lib/services/user-prefs'
import { ApiTokenCreateSchema } from '@/lib/validation/tokens'
import { IdSchema } from '@/lib/validation/common'
import { DeleteHouseholdSchema, HouseholdUpdateSchema, MemberUpdateSchema, UserPrefsSchema } from '@/lib/validation/household'
import { type ActionResult, fail, fromError, ok } from './result'

// Cierra la sesión de este hogar en el navegador: borra la fila de sesión y
// las cookies con las mismas claves que app/api/auth/logout/route.ts.
async function clearCurrentSession(ctx: Awaited<ReturnType<typeof requireHousehold>>): Promise<void> {
  await destroySession(ctx.db, ctx.session.session.id)
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  jar.delete(PREFS_COOKIE)
}

export async function createApiTokenAction(input: unknown): Promise<ActionResult<{ id: string; token: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ApiTokenCreateSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const created = await createApiToken(ctx, parsed.data)
    revalidatePath('/settings/tokens')
    return ok(created)
  } catch (e) {
    return fromError(e)
  }
}

export async function revokeApiTokenAction(id: string): Promise<ActionResult<null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = IdSchema.safeParse(id)
    if (!parsed.success) return fail('validation', 'Identificador inválido')
    await revokeApiToken(ctx, parsed.data)
    revalidatePath('/settings/tokens')
    return ok(null)
  } catch (e) {
    return fromError(e)
  }
}

// Tras guardar, espeja users.* en la cookie rz_prefs y revalida el layout
// raíz para que <html data-theme data-accent lang> cambie sin recargar.
export async function updateUserPrefsAction(input: UserPrefs): Promise<ActionResult<null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = UserPrefsSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const user = await updateUserPrefs(ctx, parsed.data)
    const jar = await cookies()
    jar.set(PREFS_COOKIE, prefsCookieValue(user), prefsCookieOptions(process.env.APP_URL ?? 'http://localhost:3000'))
    revalidatePath('/', 'layout')
    return ok(null)
  } catch (e) {
    return fromError(e)
  }
}

// Solo el propietario ve el botón en el panel; el servicio vuelve a
// comprobarlo (también acepta un token con household:write).
export async function createInviteAction(): Promise<ActionResult<{ token: string; url: string; expiresAt: string }>> {
  try {
    const ctx = await requireHousehold()
    const invite = await createInvite(ctx)
    return ok({ token: invite.token, url: invite.url, expiresAt: invite.expiresAt.toISOString() })
  } catch (e) {
    return fromError(e)
  }
}

export async function updateMemberAction(input: MemberUpdate): Promise<ActionResult<null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = MemberUpdateSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    await updateMember(ctx, parsed.data)
    revalidatePath('/settings/members')
    return ok(null)
  } catch (e) {
    return fromError(e)
  }
}

export async function removeMemberAction(userId: string): Promise<ActionResult<null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = IdSchema.safeParse(userId)
    if (!parsed.success) return fail('validation', 'Identificador inválido')
    await removeMember(ctx, parsed.data)
    revalidatePath('/settings/members')
    return ok(null)
  } catch (e) {
    return fromError(e)
  }
}

export async function updateHouseholdAction(input: HouseholdUpdate): Promise<ActionResult<HouseholdSummary>> {
  try {
    const ctx = await requireHousehold()
    const parsed = HouseholdUpdateSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const updated = await updateHousehold(ctx, parsed.data)
    revalidatePath('/settings/household')
    return ok(updated)
  } catch (e) {
    return fromError(e)
  }
}

// Salir borra la membresía (o rechaza si es el último propietario) y luego
// cierra la sesión de este navegador en este hogar: el redirect final va
// fuera del try/catch porque next/navigation lo implementa lanzando una
// excepción especial que fromError() no debe interceptar.
export async function leaveHouseholdAction(): Promise<ActionResult<null>> {
  const ctx = await requireHousehold()
  try {
    await leaveHousehold(ctx)
  } catch (e) {
    return fromError(e)
  }
  await clearCurrentSession(ctx)
  redirect('/login')
}

export async function deleteHouseholdAction(confirmName: string): Promise<ActionResult<null>> {
  const ctx = await requireHousehold()
  const parsed = DeleteHouseholdSchema.safeParse({ confirmName })
  if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
  try {
    await deleteHousehold(ctx, parsed.data.confirmName)
  } catch (e) {
    return fromError(e)
  }
  await clearCurrentSession(ctx)
  redirect('/login')
}

export async function switchHouseholdAction(householdId: string): Promise<ActionResult<null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = IdSchema.safeParse(householdId)
    if (!parsed.success) return fail('validation', 'Identificador inválido')
    await switchHousehold(ctx.db, ctx.session.session.id, parsed.data)
    revalidatePath('/', 'layout')
    return ok(null)
  } catch (e) {
    return fromError(e)
  }
}
