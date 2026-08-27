import type { DetailIngredient } from '@/components/recipes/ingredient-list'
import type { CookStep } from './cook-session'

export interface SerializableCookRecipe {
  ingredients: DetailIngredient[]
  steps: CookStep[]
}

// getRecipe (lib/services/recipes) devuelve Date reales que no cruzan la
// frontera servidor -> cliente: round-trip por JSON para quedarnos solo con
// tipos serializables. Compartido entre las dos páginas de cocinar (por
// receta suelta y por entrada del plan) para no duplicar el mismo cast.
export function toSerializableRecipe<T>(detail: T): SerializableCookRecipe {
  return JSON.parse(JSON.stringify(detail)) as SerializableCookRecipe
}
