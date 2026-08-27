// Duplicado deliberado del enum meal_slot (db/schema/_types.ts) y de
// MealSlotSchema (lib/validation/plan.ts): lib/domain no puede importar de
// validation ni de db (fronteras de eslint-boundaries). El contrato entre las
// tres listas se comprueba en tests/contracts/enums.test.ts.
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

// Hueco por defecto al cocinar una receta sin entrada en el plan (§9.5, paso 1).
// Horario peninsular: se desayuna hasta las 11, se come de 11 a 16, la merienda
// (16–19) y la madrugada cuentan como picoteo, y se cena de 19 en adelante.
// El usuario siempre puede elegir otro: esto es solo el valor por defecto.
export function slotForHour(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 19 && hour < 24) return 'dinner'
  return 'snack'
}
