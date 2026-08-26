// Alias de unidades → unidad base + factor de conversión.
//
// DESVIACIÓN respecto al plan de la Tarea 6: esta lista debía importarse de
// `UNIT_ALIASES` en `@/lib/domain/units-data` (Tarea 8, pista b). Ese fichero
// todavía no existe en esta rama (w1-a-schema), así que se deja aquí en
// espejo exacto de los datos que produce esa fuente canónica (mismos alias,
// locale, unidad base y factor). Al cerrar W1, sustituir el import en
// `scripts/seed.ts` por `@/lib/domain/units-data` y borrar este fichero.
export interface UnitAliasSeed {
  alias: string
  locale: 'es' | 'en'
  unit: 'g' | 'ml' | 'ud'
  factorToBase: number
}

export const UNIT_ALIASES: UnitAliasSeed[] = [
  // es — masa
  { alias: 'g', locale: 'es', unit: 'g', factorToBase: 1 },
  { alias: 'gr', locale: 'es', unit: 'g', factorToBase: 1 },
  { alias: 'grs', locale: 'es', unit: 'g', factorToBase: 1 },
  { alias: 'gramo', locale: 'es', unit: 'g', factorToBase: 1 },
  { alias: 'gramos', locale: 'es', unit: 'g', factorToBase: 1 },
  { alias: 'kg', locale: 'es', unit: 'g', factorToBase: 1000 },
  { alias: 'kilo', locale: 'es', unit: 'g', factorToBase: 1000 },
  { alias: 'kilos', locale: 'es', unit: 'g', factorToBase: 1000 },
  { alias: 'kilogramo', locale: 'es', unit: 'g', factorToBase: 1000 },
  { alias: 'kilogramos', locale: 'es', unit: 'g', factorToBase: 1000 },
  { alias: 'oz', locale: 'es', unit: 'g', factorToBase: 28.35 },
  { alias: 'onza', locale: 'es', unit: 'g', factorToBase: 28.35 },
  { alias: 'onzas', locale: 'es', unit: 'g', factorToBase: 28.35 },
  { alias: 'lb', locale: 'es', unit: 'g', factorToBase: 453.6 },
  { alias: 'libra', locale: 'es', unit: 'g', factorToBase: 453.6 },
  { alias: 'libras', locale: 'es', unit: 'g', factorToBase: 453.6 },
  // es — volumen
  { alias: 'ml', locale: 'es', unit: 'ml', factorToBase: 1 },
  { alias: 'mililitro', locale: 'es', unit: 'ml', factorToBase: 1 },
  { alias: 'mililitros', locale: 'es', unit: 'ml', factorToBase: 1 },
  { alias: 'l', locale: 'es', unit: 'ml', factorToBase: 1000 },
  { alias: 'litro', locale: 'es', unit: 'ml', factorToBase: 1000 },
  { alias: 'litros', locale: 'es', unit: 'ml', factorToBase: 1000 },
  { alias: 'cl', locale: 'es', unit: 'ml', factorToBase: 10 },
  { alias: 'cdta', locale: 'es', unit: 'ml', factorToBase: 5 },
  { alias: 'cdtas', locale: 'es', unit: 'ml', factorToBase: 5 },
  { alias: 'cucharadita', locale: 'es', unit: 'ml', factorToBase: 5 },
  { alias: 'cucharaditas', locale: 'es', unit: 'ml', factorToBase: 5 },
  { alias: 'c/c', locale: 'es', unit: 'ml', factorToBase: 5 },
  { alias: 'cda', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'cdas', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'cucharada', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'cucharadas', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'cucharada sopera', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'cucharadas soperas', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'c/s', locale: 'es', unit: 'ml', factorToBase: 15 },
  { alias: 'taza', locale: 'es', unit: 'ml', factorToBase: 240 },
  { alias: 'tazas', locale: 'es', unit: 'ml', factorToBase: 240 },
  { alias: 'vaso', locale: 'es', unit: 'ml', factorToBase: 240 },
  { alias: 'vasos', locale: 'es', unit: 'ml', factorToBase: 240 },
  // es — unidad
  { alias: 'ud', locale: 'es', unit: 'ud', factorToBase: 1 },
  { alias: 'uds', locale: 'es', unit: 'ud', factorToBase: 1 },
  { alias: 'unidad', locale: 'es', unit: 'ud', factorToBase: 1 },
  { alias: 'unidades', locale: 'es', unit: 'ud', factorToBase: 1 },
  { alias: 'pieza', locale: 'es', unit: 'ud', factorToBase: 1 },
  { alias: 'piezas', locale: 'es', unit: 'ud', factorToBase: 1 },
  // en — mass
  { alias: 'g', locale: 'en', unit: 'g', factorToBase: 1 },
  { alias: 'gram', locale: 'en', unit: 'g', factorToBase: 1 },
  { alias: 'grams', locale: 'en', unit: 'g', factorToBase: 1 },
  { alias: 'kg', locale: 'en', unit: 'g', factorToBase: 1000 },
  { alias: 'kilo', locale: 'en', unit: 'g', factorToBase: 1000 },
  { alias: 'kilos', locale: 'en', unit: 'g', factorToBase: 1000 },
  { alias: 'kilogram', locale: 'en', unit: 'g', factorToBase: 1000 },
  { alias: 'kilograms', locale: 'en', unit: 'g', factorToBase: 1000 },
  { alias: 'oz', locale: 'en', unit: 'g', factorToBase: 28.35 },
  { alias: 'ounce', locale: 'en', unit: 'g', factorToBase: 28.35 },
  { alias: 'ounces', locale: 'en', unit: 'g', factorToBase: 28.35 },
  { alias: 'lb', locale: 'en', unit: 'g', factorToBase: 453.6 },
  { alias: 'lbs', locale: 'en', unit: 'g', factorToBase: 453.6 },
  { alias: 'pound', locale: 'en', unit: 'g', factorToBase: 453.6 },
  { alias: 'pounds', locale: 'en', unit: 'g', factorToBase: 453.6 },
  // en — volume
  { alias: 'ml', locale: 'en', unit: 'ml', factorToBase: 1 },
  { alias: 'milliliter', locale: 'en', unit: 'ml', factorToBase: 1 },
  { alias: 'milliliters', locale: 'en', unit: 'ml', factorToBase: 1 },
  { alias: 'millilitre', locale: 'en', unit: 'ml', factorToBase: 1 },
  { alias: 'millilitres', locale: 'en', unit: 'ml', factorToBase: 1 },
  { alias: 'l', locale: 'en', unit: 'ml', factorToBase: 1000 },
  { alias: 'liter', locale: 'en', unit: 'ml', factorToBase: 1000 },
  { alias: 'liters', locale: 'en', unit: 'ml', factorToBase: 1000 },
  { alias: 'litre', locale: 'en', unit: 'ml', factorToBase: 1000 },
  { alias: 'litres', locale: 'en', unit: 'ml', factorToBase: 1000 },
  { alias: 'fl oz', locale: 'en', unit: 'ml', factorToBase: 29.57 },
  { alias: 'floz', locale: 'en', unit: 'ml', factorToBase: 29.57 },
  { alias: 'tsp', locale: 'en', unit: 'ml', factorToBase: 5 },
  { alias: 'teaspoon', locale: 'en', unit: 'ml', factorToBase: 5 },
  { alias: 'teaspoons', locale: 'en', unit: 'ml', factorToBase: 5 },
  { alias: 'tbsp', locale: 'en', unit: 'ml', factorToBase: 15 },
  { alias: 'tbs', locale: 'en', unit: 'ml', factorToBase: 15 },
  { alias: 'tablespoon', locale: 'en', unit: 'ml', factorToBase: 15 },
  { alias: 'tablespoons', locale: 'en', unit: 'ml', factorToBase: 15 },
  { alias: 'cup', locale: 'en', unit: 'ml', factorToBase: 240 },
  { alias: 'cups', locale: 'en', unit: 'ml', factorToBase: 240 },
  // en — unit
  { alias: 'pc', locale: 'en', unit: 'ud', factorToBase: 1 },
  { alias: 'pcs', locale: 'en', unit: 'ud', factorToBase: 1 },
  { alias: 'piece', locale: 'en', unit: 'ud', factorToBase: 1 },
  { alias: 'pieces', locale: 'en', unit: 'ud', factorToBase: 1 },
  { alias: 'unit', locale: 'en', unit: 'ud', factorToBase: 1 },
  { alias: 'units', locale: 'en', unit: 'ud', factorToBase: 1 },
]
