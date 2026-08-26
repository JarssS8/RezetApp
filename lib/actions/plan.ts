'use server'

import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import { IdSchema } from '@/lib/validation/common'
import { CreateLeftoverInputSchema, PlanBatchSchema, PlanEntryMoveSchema, PlanEntryPatchSchema, ProposalDecisionSchema } from '@/lib/validation/plan'
import type { PlanBatch, PlanEntryMove, PlanEntryPatch } from '@/lib/validation/plan'
import { applyBatch, createLeftover, decideProposal, moveEntry, patchEntry, searchRecipesLite, type PlanEntryView, type ProposalView } from '@/lib/services/plan'
import { type ActionResult, fail, fromError, ok } from './result'

const PLAN_PATH = '/plan'

export async function applyPlanBatchAction(batch: PlanBatch): Promise<ActionResult<{ added: PlanEntryView[]; removed: string[] }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PlanBatchSchema.safeParse(batch)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const result = await applyBatch(ctx, parsed.data)
    revalidatePath(PLAN_PATH)
    return ok(result)
  } catch (e) {
    return fromError(e)
  }
}

export async function movePlanEntryAction(input: PlanEntryMove): Promise<ActionResult<PlanEntryView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PlanEntryMoveSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const view = await moveEntry(ctx, parsed.data)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

export async function patchPlanEntryAction(id: string, patch: PlanEntryPatch): Promise<ActionResult<PlanEntryView>> {
  try {
    const ctx = await requireHousehold()
    const idParsed = IdSchema.safeParse(id)
    if (!idParsed.success) return fail('validation', 'Identificador inválido')
    const patchParsed = PlanEntryPatchSchema.safeParse(patch)
    if (!patchParsed.success) return fail('validation', patchParsed.error.issues[0]?.message ?? 'Datos inválidos')
    const view = await patchEntry(ctx, idParsed.data, patchParsed.data)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

export async function createLeftoverAction(input: unknown): Promise<ActionResult<PlanEntryView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = CreateLeftoverInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const view = await createLeftover(ctx, parsed.data)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

export async function decideProposalAction(id: string, decision: 'approve' | 'reject'): Promise<ActionResult<ProposalView>> {
  try {
    const ctx = await requireHousehold()
    const idParsed = IdSchema.safeParse(id)
    if (!idParsed.success) return fail('validation', 'Identificador inválido')
    const decisionParsed = ProposalDecisionSchema.safeParse({ decision })
    if (!decisionParsed.success) return fail('validation', 'Decisión inválida')
    const view = await decideProposal(ctx, idParsed.data, decisionParsed.data.decision)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

// Búsqueda de recetas para la hoja de "añadir al plan" (ver lib/services/plan.ts::searchRecipesLite)
export async function searchRecipesForPlanAction(q: string): Promise<ActionResult<{ id: string; title: string }[]>> {
  try {
    const ctx = await requireHousehold()
    const results = await searchRecipesLite(ctx, q)
    return ok(results)
  } catch (e) {
    return fromError(e)
  }
}
