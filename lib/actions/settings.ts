'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { prefsCookieOptions, prefsCookieValue } from '@/lib/auth/cookies'
import { requireHousehold } from '@/lib/auth/guards'
import { PREFS_COOKIE } from '@/lib/prefs'
import { createApiToken, revokeApiToken } from '@/lib/services/api-tokens'
import { updateUserPrefs, type UserPrefs } from '@/lib/services/user-prefs'
import { ApiTokenCreateSchema } from '@/lib/validation/tokens'
import { IdSchema } from '@/lib/validation/common'
import { UserPrefsSchema } from '@/lib/validation/household'
import { type ActionResult, fail, fromError, ok } from './result'

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
