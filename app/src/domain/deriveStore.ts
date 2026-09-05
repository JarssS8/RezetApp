import { scaleQuantity } from './scaling';
import { isCovered } from './coverage';
import { shoppingNeeds } from './shopping';
import { weekDays, dateKey } from './dates';
import type { Ingredient, Locale, PantryItem, PlanEntry, Recipe, Shortage, ShoppingNeed, Unit } from '../types';

/**
 * Las cinco derivaciones puras que necesita cualquier `Store`, sean los datos
 * de `localStorage` o los que trae Supabase: dependen solo de los arrays ya
 * cargados en memoria, nunca de la red. Compartidas para que store.tsx y
 * supabaseStore.tsx den el mismo número — la regla de "un solo cálculo,
 * cuatro pantallas" de CLAUDE.md también aplica entre las dos capas de datos.
 */
export function createStoreDerivations(args: {
  pantry: PantryItem[];
  recipeById: Map<string, Recipe>;
  ingredientById: Map<string, Ingredient>;
  plan: PlanEntry[];
  locale: Locale;
}) {
  const { pantry, recipeById, ingredientById, plan, locale } = args;

  const stockOf = (ingredientId: string, unit: Unit): number =>
    pantry
      .filter((p) => p.ingredientId === ingredientId && p.unit === unit)
      .reduce((sum, p) => sum + p.quantity, 0);

  const needOf = (recipe: Recipe, index: number, servings: number): number => {
    const ri = recipe.ingredients[index];
    if (!ri) return 0;
    const sensitive = ingredientById.get(ri.ingredientId)?.sensitive ?? false;
    return scaleQuantity(ri.quantity, recipe.baseServings, servings, sensitive);
  };

  const coverageOf = (recipe: Recipe, servings: number) => {
    let have = 0;
    recipe.ingredients.forEach((ri, index) => {
      if (isCovered(needOf(recipe, index, servings), stockOf(ri.ingredientId, ri.unit))) have += 1;
    });
    const total = recipe.ingredients.length;
    return { have, total, full: total > 0 && have === total };
  };

  const needsForWeek = (weekOffset: number): ShoppingNeed[] =>
    shoppingNeeds({
      dates: weekDays(weekOffset).map(dateKey),
      plan,
      recipes: recipeById,
      pantry,
      ingredients: ingredientById,
      locale,
    });

  const shortagesFor = (recipe: Recipe, servings: number): Shortage[] => {
    const out: Shortage[] = [];
    recipe.ingredients.forEach((ri, index) => {
      const need = needOf(recipe, index, servings);
      const have = stockOf(ri.ingredientId, ri.unit);
      if (have < need * 0.999) {
        out.push({
          name: ingredientById.get(ri.ingredientId)?.name[locale] ?? '',
          quantity: need - have,
          unit: ri.unit,
        });
      }
    });
    return out;
  };

  return { stockOf, needOf, coverageOf, needsForWeek, shortagesFor };
}
