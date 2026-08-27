import { describe, expect, it } from 'vitest'
import { planAdherence, type PlanStatEntry } from './plan-stats'

const entry = (over: Partial<PlanStatEntry> = {}): PlanStatEntry => ({ status: 'planned', isLeftover: false, kcalPerServing: 400, servings: 2, ...over })

describe('planAdherence', () => {
  it('cuenta cocinadas, saltadas y pendientes, y calcula la adherencia', () => {
    const result = planAdherence([entry({ status: 'cooked' }), entry({ status: 'cooked' }), entry({ status: 'skipped' }), entry()])
    expect(result).toMatchObject({ planned: 4, cooked: 2, skipped: 1, pending: 1, adherence: 2 / 3 })
  })

  it('las sobras no cuentan como plan ni como calorías (ya contaron el día que se cocinó su receta)', () => {
    const result = planAdherence([entry({ status: 'cooked' }), entry({ status: 'cooked', isLeftover: true })])
    expect(result).toMatchObject({ planned: 1, cooked: 1, plannedKcal: 800, cookedKcal: 800 })
  })

  it('sin nada decidido la adherencia es null, no cero', () => {
    expect(planAdherence([entry(), entry()]).adherence).toBeNull()
    expect(planAdherence([]).adherence).toBeNull()
  })

  it('una receta sin kilocalorías conocidas no suma, pero sí cuenta como comida', () => {
    const result = planAdherence([entry({ status: 'cooked', kcalPerServing: null })])
    expect(result).toMatchObject({ cooked: 1, cookedKcal: 0 })
  })
})
