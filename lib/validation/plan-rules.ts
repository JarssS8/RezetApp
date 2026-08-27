import { z } from 'zod'
import { MealSlotSchema } from './common'

// households.plan_rules (spec §9.9). Mismo esquema para lo que llega del
// formulario de ajustes y para lo que se lee del jsonb: la columna puede
// contener cualquier cosa (migración manual, versión anterior), así que se
// valida SIEMPRE antes de dárselo al dominio.
export const PlanRuleSchema = z
  .strictObject({
    day: z.number().int().min(0).max(6).nullable(), // 0 domingo … 6 sábado; null = todos
    slot: MealSlotSchema.nullable(),
    constraint: z.enum(['no-meat', 'max-minutes', 'tag', 'not-tag']),
    value: z.string().trim().max(60),
  })
  // 'no-meat' no lleva valor: se normaliza a '' para que dos reglas iguales
  // no se distingan por un resto de texto del formulario.
  .transform((r) => (r.constraint === 'no-meat' ? { ...r, value: '' } : r))
  .refine((r) => r.constraint === 'no-meat' || r.value.length > 0, { message: 'La regla necesita un valor' })
  .refine((r) => r.constraint !== 'max-minutes' || Number.isFinite(Number(r.value)), { message: 'Los minutos deben ser un número' })

export type PlanRuleInput = z.infer<typeof PlanRuleSchema>

// 40 reglas es mucho más de lo que nadie va a escribir a mano y acota el jsonb.
export const PlanRulesSchema = z.array(PlanRuleSchema).max(40)
