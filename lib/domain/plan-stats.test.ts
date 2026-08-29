import { describe, expect, it } from 'vitest'
import { planAdherence, planStatsByDay, type PlanStatEntry } from './plan-stats'

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

describe('planStatsByDay', () => {
  const days = ['2026-08-24', '2026-08-25', '2026-08-26']

  it('agrupa por fecha con el mismo cálculo de kcal que planAdherence', () => {
    const result = planStatsByDay(
      [
        { ...entry({ status: 'cooked' }), date: '2026-08-24' },
        { ...entry({ status: 'planned' }), date: '2026-08-24' },
        { ...entry({ status: 'cooked', kcalPerServing: 600 }), date: '2026-08-25' },
      ],
      days,
    )
    expect(result).toEqual([
      { date: '2026-08-24', plannedKcal: 1600, cookedKcal: 800 },
      { date: '2026-08-25', plannedKcal: 1200, cookedKcal: 1200 },
      { date: '2026-08-26', plannedKcal: 0, cookedKcal: 0 },
    ])
  })

  it('un día sin ninguna entrada sale en cero, no se omite', () => {
    expect(planStatsByDay([], days)).toEqual(days.map((date) => ({ date, plannedKcal: 0, cookedKcal: 0 })))
  })

  it('una entrada con una fecha fuera del rango pedido se ignora', () => {
    const result = planStatsByDay([{ ...entry({ status: 'cooked' }), date: '2026-09-01' }], days)
    expect(result).toEqual(days.map((date) => ({ date, plannedKcal: 0, cookedKcal: 0 })))
  })
})
