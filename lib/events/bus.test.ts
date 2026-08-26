import { describe, expect, it, vi } from 'vitest'
import { emitHouseholdEvent, subscribeHousehold } from './bus'

describe('bus de eventos', () => {
  it('entrega solo al hogar suscrito y permite desuscribir', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeHousehold('h1', a)
    subscribeHousehold('h2', b)
    emitHouseholdEvent('h1', { type: 'pantry.changed', payload: { foodIds: ['f1'] } })
    expect(a).toHaveBeenCalledWith({ type: 'pantry.changed', payload: { foodIds: ['f1'] } })
    expect(b).not.toHaveBeenCalled()
    offA()
    emitHouseholdEvent('h1', { type: 'plan.changed', payload: { dates: ['2026-08-27'] } })
    expect(a).toHaveBeenCalledTimes(1)
  })
  it('un listener que lanza no rompe a los demás', () => {
    subscribeHousehold('h3', () => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    subscribeHousehold('h3', ok)
    emitHouseholdEvent('h3', { type: 'recipe.changed', payload: { recipeId: 'r' } })
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
