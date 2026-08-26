'use server'

import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import { createApiToken, revokeApiToken } from '@/lib/services/api-tokens'
import { ApiTokenCreateSchema } from '@/lib/validation/tokens'
import { IdSchema } from '@/lib/validation/common'
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
