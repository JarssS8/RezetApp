import { z } from 'zod'
import { DateSchema, IdSchema, MealSlotSchema } from './common'

// Reexportado como tipo de dominio para las firmas de lib/services/plan.ts
export type MealSlot = z.infer<typeof MealSlotSchema>

export const PlanEntryInputSchema = z
  .strictObject({
    date: DateSchema,
    slot: MealSlotSchema,
    recipeId: IdSchema.nullable().optional(),
    customTitle: z.string().trim().min(1).max(120).nullable().optional(),
    servings: z.number().int().min(1).max(100),
    timeBudgetMinutes: z.number().int().min(0).nullable().optional(),
    leftoverOfEntryId: IdSchema.nullable().optional(),
  })
  .refine((e) => e.recipeId || e.customTitle, { message: 'recipeId o customTitle' })
export type PlanEntryInput = z.infer<typeof PlanEntryInputSchema>
export const PlanBatchSchema = z.strictObject({ add: z.array(PlanEntryInputSchema).max(60).default([]), remove: z.array(IdSchema).max(60).default([]) })
export type PlanBatch = z.infer<typeof PlanBatchSchema>
// Las propuestas (IA, reglas, MCP) usan exactamente el mismo contrato que el lote
export const ProposalPayloadSchema = PlanBatchSchema
export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>
export const PlanEntryMoveSchema = z.strictObject({ entryId: IdSchema, date: DateSchema, slot: MealSlotSchema, sortOrder: z.number().int().min(0).default(0) })
export type PlanEntryMove = z.infer<typeof PlanEntryMoveSchema>
export const PlanEntryPatchSchema = z.strictObject({ servings: z.number().int().min(1).max(100).optional(), skipped: z.boolean().optional(), timeBudgetMinutes: z.number().int().min(0).nullable().optional() })
export type PlanEntryPatch = z.infer<typeof PlanEntryPatchSchema>
export const ProposalDecisionSchema = z.strictObject({ decision: z.enum(['approve', 'reject']) })
// Crear una sobra a partir de una entrada existente (lib/actions/plan.ts::createLeftoverAction);
// se define aquí (no en un fichero nuevo) porque, aunque no forma parte del contrato original
// de W1, sí es del propio contrato de esta pista y lo valida también el test del diálogo.
export const CreateLeftoverInputSchema = z.strictObject({ ofEntryId: IdSchema, date: DateSchema, slot: MealSlotSchema, servings: z.number().int().min(1).max(100) })
export type CreateLeftoverInput = z.infer<typeof CreateLeftoverInputSchema>
