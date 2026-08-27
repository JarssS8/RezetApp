import { describe, expect, it } from 'vitest'
import { MEAL_SLOTS, slotForHour } from './slots'

describe('slots', () => {
  it('la lista es la de meal_slot, en orden', () => {
    expect([...MEAL_SLOTS]).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
  })
  it('reparte el día en desayuno, comida, cena y picoteo', () => {
    expect([5, 8, 10].map(slotForHour)).toEqual(['breakfast', 'breakfast', 'breakfast'])
    expect([11, 14, 15].map(slotForHour)).toEqual(['lunch', 'lunch', 'lunch'])
    expect([19, 21, 23].map(slotForHour)).toEqual(['dinner', 'dinner', 'dinner'])
    // media tarde y madrugada caen en picoteo
    expect([16, 18, 0, 4].map(slotForHour)).toEqual(['snack', 'snack', 'snack', 'snack'])
  })
  it('una hora fuera de rango cae en picoteo en vez de reventar', () => {
    expect(slotForHour(-1)).toBe('snack')
    expect(slotForHour(24)).toBe('snack')
  })
})
