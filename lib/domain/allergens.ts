// Alérgenos de una receta a partir de los de sus alimentos (foods.allergens).
// PURO: es lo que hace que el filtro de las propuestas sea del código y no del
// modelo (regla 2 de AGENTS.md).
//
// Duplicado deliberado de lib/validation/household.ts::ALLERGENS: las fronteras
// prohíben que lib/domain importe de lib/validation. tests/contracts/allergens.test.ts
// impide que las dos listas se separen.
export const ALLERGENS = [
  'gluten', 'lactose', 'egg', 'fish', 'shellfish', 'nuts', 'peanut', 'soy',
  'sesame', 'celery', 'mustard', 'sulphites', 'lupin', 'mollusc',
] as const
export type Allergen = (typeof ALLERGENS)[number]

const KNOWN: ReadonlySet<string> = new Set(ALLERGENS)

export interface AllergenIngredient {
  foodId: string | null
  allergens: string[]
}

export interface RecipeAllergenInfo {
  allergens: string[]
  // Un ingrediente sin alimento resuelto puede esconder cualquier cosa: la
  // lista de arriba es lo que SE SABE, no lo que hay. La interfaz lo dice y el
  // filtro de propuestas no descarta por esto (descartar por lo que no se sabe
  // dejaría medio recetario fuera).
  unknown: boolean
}

export function recipeAllergens(ingredients: AllergenIngredient[]): RecipeAllergenInfo {
  const found = new Set<string>()
  let unknown = false
  for (const ingredient of ingredients) {
    if (ingredient.foodId === null) {
      unknown = true
      continue
    }
    // foods.allergens es text[] sin restricción: una importación pudo meter
    // etiquetas que no son de la lista, y no se propagan.
    for (const a of ingredient.allergens) if (KNOWN.has(a)) found.add(a)
  }
  return { allergens: Array.from(found).sort(), unknown }
}

export function allergenConflicts(recipe: string[], members: string[]): string[] {
  const wanted = new Set(members)
  return recipe.filter((a) => wanted.has(a)).sort()
}
