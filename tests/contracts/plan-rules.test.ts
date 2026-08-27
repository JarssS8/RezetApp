import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PlanRule, ProposalPayload as DomainPayload } from '@/lib/domain/plan-rules'
import type { ProposalPayload as ValidationPayload } from '@/lib/validation/plan'
import { PlanRuleSchema, PlanRulesSchema, type PlanRuleInput } from '@/lib/validation/plan-rules'

// Las fronteras de eslint-boundaries impiden que lib/domain importe de
// lib/validation, así que PlanRule y ProposalPayload viven duplicados a
// propósito. Este fichero, fuera de la valla, evita que se separen.
describe('contrato de las reglas del plan', () => {
  it('el tipo del esquema zod y el del dominio son el mismo', () => {
    expectTypeOf<PlanRuleInput>().toEqualTypeOf<PlanRule>()
  })

  it('lo que produce el dominio es un ProposalPayload válido para el servicio', () => {
    expectTypeOf<DomainPayload>().toMatchTypeOf<ValidationPayload>()
  })

  it('rechaza una restricción desconocida y un día fuera de rango', () => {
    expect(PlanRuleSchema.safeParse({ day: null, slot: null, constraint: 'no-gluten', value: '' }).success).toBe(false)
    expect(PlanRuleSchema.safeParse({ day: 7, slot: null, constraint: 'no-meat', value: '' }).success).toBe(false)
    expect(PlanRuleSchema.safeParse({ day: 1, slot: 'lunch', constraint: 'no-meat', value: '' }).success).toBe(true)
  })

  it('exige value en las restricciones que lo usan y lo vacía en no-meat', () => {
    expect(PlanRuleSchema.safeParse({ day: null, slot: null, constraint: 'tag', value: '' }).success).toBe(false)
    expect(PlanRuleSchema.safeParse({ day: null, slot: null, constraint: 'max-minutes', value: 'pronto' }).success).toBe(false)
    expect(PlanRuleSchema.parse({ day: null, slot: null, constraint: 'no-meat', value: 'lo que sea' }).value).toBe('')
  })

  it('un jsonb con basura no revienta: PlanRulesSchema lo rechaza entero', () => {
    expect(PlanRulesSchema.safeParse([{ nada: 1 }]).success).toBe(false)
    expect(PlanRulesSchema.safeParse([]).success).toBe(true)
  })
})
