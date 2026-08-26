import { stripAccents } from './units-data'
import type { Ingredient, Locale, RecipeForScaling, ScaledRecipe } from './types'

// Exponente de amortiguación: duplicar la sal arruina el plato
export const DAMP = 0.65

export function scaleQuantity(qty: number, ratio: number, scalesLinearly: boolean): number {
  return scalesLinearly ? qty * ratio : qty * Math.pow(ratio, DAMP)
}

export function scaleIngredient(i: Ingredient, ratio: number): Ingredient {
  return {
    ...i,
    quantity: i.quantity === null ? null : scaleQuantity(i.quantity, ratio, i.scalesLinearly),
    displayQuantity: i.displayQuantity === null ? null : scaleQuantity(i.displayQuantity, ratio, i.scalesLinearly),
  }
}

// Tiempos, temperaturas y tamaño de molde no se tocan: la UI los avisa
export function scaleRecipe(recipe: RecipeForScaling, targetServings: number): ScaledRecipe {
  if (!(targetServings > 0) || !(recipe.servingsBase > 0)) throw new Error('Las raciones deben ser positivas')
  const ratio = targetServings / recipe.servingsBase
  const ingredients = recipe.ingredients.map((i) => scaleIngredient(i, ratio))
  return { servings: targetServings, ratio, ingredients, nonLinearIds: recipe.ingredients.filter((i) => !i.scalesLinearly).map((i) => i.id) }
}

const NON_LINEAR: Record<Locale, string[]> = {
  es: [
    'sal', 'pimienta', 'comino', 'pimenton', 'oregano', 'tomillo', 'romero', 'laurel', 'canela', 'nuez moscada', 'clavo', 'curry', 'cilantro seco', 'guindilla', 'cayena', 'azafran', 'cardamomo', 'anis', 'jengibre molido', 'curcuma', 'hierbas',
    'levadura', 'bicarbonato', 'impulsor', 'gelatina', 'agar',
    'vino', 'brandy', 'conac', 'coñac', 'ron', 'whisky', 'vermut', 'jerez', 'licor', 'cerveza', 'sidra',
    'esencia', 'extracto', 'aroma', 'colorante',
  ],
  en: [
    'salt', 'pepper', 'cumin', 'paprika', 'oregano', 'thyme', 'rosemary', 'bay', 'cinnamon', 'nutmeg', 'clove', 'curry', 'chili', 'cayenne', 'saffron', 'cardamom', 'anise', 'ground ginger', 'turmeric', 'herbs', 'spice',
    'yeast', 'baking powder', 'baking soda', 'gelatin', 'agar',
    'wine', 'brandy', 'cognac', 'rum', 'whisky', 'whiskey', 'vermouth', 'sherry', 'liqueur', 'beer', 'cider',
    'essence', 'extract', 'flavoring', 'food coloring',
  ],
}

// Heurística por nombre: se aplica al importar y el usuario puede corregirla
export function isNonLinearByDefault(foodName: string, locale: Locale): boolean {
  const name = stripAccents(foodName.toLowerCase())
  const words = name.split(/[\s,]+/)
  const lists = [NON_LINEAR[locale], NON_LINEAR[locale === 'es' ? 'en' : 'es']]
  return lists.some((list) => list.some((term) => (term.includes(' ') ? name.includes(term) : words.includes(term))))
}
