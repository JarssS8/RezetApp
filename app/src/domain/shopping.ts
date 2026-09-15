import { scaleQuantity } from './scaling';
import { SLOT_ORDER } from './dates';
import type { Ingredient, Locale, PantryItem, PlanEntry, Recipe, ShoppingNeed } from '../types';

/** Migajas por debajo de esto no entran en la lista. */
const CRUMB_THRESHOLD = 0.5;

/**
 * Lista de la compra = lo que pide el plan de la semana, menos la despensa.
 *
 * Recorre los días indicados, ignora las comidas ya cocinadas, acumula por
 * `ingredienteId|unidad`, resta las existencias y descarta los huecos
 * insignificantes.
 */
export function shoppingNeeds(args: {
  dates: string[];
  plan: PlanEntry[];
  recipes: Map<string, Recipe>;
  pantry: PantryItem[];
  ingredients: Map<string, Ingredient>;
  locale: Locale;
}): ShoppingNeed[] {
  const { dates, plan, recipes, pantry, ingredients, locale } = args;
  const wanted = new Set(dates);
  const need = new Map<string, ShoppingNeed>();

  for (const entry of plan) {
    if (entry.cooked || !wanted.has(entry.date)) continue;
    const recipe = recipes.get(entry.recipeId);
    if (!recipe) continue;

    for (const ri of recipe.ingredients) {
      // "Al gusto": no hay cantidad que comprar, no entra en la lista.
      if (ri.toTaste || ri.quantity == null || ri.unit == null) continue;
      const ing = ingredients.get(ri.ingredientId);
      if (!ing) continue;
      const key = `${ri.ingredientId}|${ri.unit}`;
      const amount = scaleQuantity(ri.quantity, recipe.baseServings, entry.servings, ing.sensitive);
      const current = need.get(key);
      if (current) current.quantity += amount;
      else
        need.set(key, {
          key,
          ingredientId: ri.ingredientId,
          name: ing.name[locale] || ing.name.es,
          quantity: amount,
          unit: ri.unit,
          group: ing.group,
        });
    }
  }

  const out: ShoppingNeed[] = [];
  for (const item of need.values()) {
    const have = pantry
      .filter((p) => p.ingredientId === item.ingredientId && p.unit === item.unit)
      .reduce((sum, p) => sum + p.quantity, 0);
    const gap = item.quantity - have;
    if (gap > CRUMB_THRESHOLD) out.push({ ...item, quantity: gap });
  }
  return out;
}

export const SHOPPING_GROUP_ORDER = ['fresco', 'seco', 'conserva'] as const;

/** Total de kcal de un día, cocinado o no. */
export function dayKcal(date: string, plan: PlanEntry[], recipes: Map<string, Recipe>): number {
  return plan
    .filter((e) => e.date === date)
    .reduce((sum, e) => sum + (recipes.get(e.recipeId)?.kcalPerServing ?? 0) * e.servings, 0);
}

/** Entradas de un día ordenadas por franja. */
export function entriesOfDay(date: string, plan: PlanEntry[]): PlanEntry[] {
  return plan
    .filter((e) => e.date === date)
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}
