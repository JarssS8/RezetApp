'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireHousehold, requireRole } from '@/lib/auth/guards'
import type { PlanRule } from '@/lib/domain/plan-rules'
import { proposeWeekFromRules, updatePlanRules } from '@/lib/services/plan-rules'
import { DateSchema } from '@/lib/validation/common'
import { PlanRulesSchema } from '@/lib/validation/plan-rules'
import { type ActionResult, fail, fromError, ok } from './result'

// Solo el propietario cambia cómo se rellena el plan del hogar (mismo criterio
// que el resto de ajustes del hogar).
export async function updatePlanRulesAction(input: unknown): Promise<ActionResult<PlanRule[]>> {
  try {
    const ctx = await requireRole('owner')
    const parsed = PlanRulesSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const saved = await updatePlanRules(ctx, parsed.data)
    revalidatePath('/settings/household')
    return ok(saved)
  } catch (e) {
    return fromError(e)
  }
}

const ProposeRangeSchema = z
  .strictObject({ from: DateSchema, to: DateSchema })
  .refine((v) => v.from <= v.to, { message: 'from debe ser ≤ to' })

export async function proposeWeekFromRulesAction(input: unknown): Promise<ActionResult<{ proposalId: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ProposeRangeSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Rango de fechas inválido')
    const view = await proposeWeekFromRules(ctx, parsed.data)
    revalidatePath('/plan')
    revalidatePath('/plan/proposals')
    return ok({ proposalId: view.id })
  } catch (e) {
    return fromError(e)
  }
}
