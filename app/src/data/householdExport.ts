import type { Difficulty, Ingredient, Locale, Recipe, Unit } from '../types';

/**
 * Forma de exportación de "descargar copia (JSON)" en el borrado de hogar
 * (ver `DeleteHouseholdFlow.tsx`). Vive aquí, junto a `store.tsx`/
 * `supabaseStore.tsx`, porque da forma a datos ya cargados por `useData()`
 * para salir de la app — no es una regla de negocio (no pertenece a
 * `domain/`, que son las reglas puras de escalado/cobertura/compra).
 */
export interface HouseholdExportIngredient {
  name: string;
  /** `null` si `toTaste`: "sal al gusto" no lleva cantidad. */
  quantity: number | null;
  unit: Unit | null;
  toTaste: boolean;
}

export interface HouseholdExportStep {
  text: string;
  timerMinutes: number | null;
}

export interface HouseholdExportRecipe {
  name: string;
  description: string;
  servings: number;
  difficulty: Difficulty;
  minutes: number;
  kcal: number;
  ingredients: HouseholdExportIngredient[];
  steps: HouseholdExportStep[];
}

/** Serializa las recetas ya cargadas a un array plano, en el idioma activo. */
export function buildHouseholdExport(
  recipes: Recipe[],
  ingredientById: Map<string, Ingredient>,
  locale: Locale,
): HouseholdExportRecipe[] {
  return recipes.map((r) => ({
    name: r.name[locale],
    description: r.description[locale],
    servings: r.baseServings,
    difficulty: r.difficulty,
    minutes: r.minutes,
    kcal: r.kcalPerServing,
    ingredients: r.ingredients.map((ri) => ({
      name: ingredientById.get(ri.ingredientId)?.name[locale] ?? ri.ingredientId,
      quantity: ri.quantity,
      unit: ri.unit,
      toTaste: ri.toTaste ?? false,
    })),
    steps: r.steps.map((s) => ({
      text: s.text[locale],
      timerMinutes: s.timerMinutes ?? null,
    })),
  }));
}

/**
 * Dispara una descarga de verdad en el navegador (Blob + <a download>). No
 * hay ida y vuelta al servidor: todo lo que hace falta ya está en memoria
 * vía `useData()`.
 */
export function downloadHouseholdExport(recipes: HouseholdExportRecipe[], householdName: string): void {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const slug =
    householdName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'rezet';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-recetas.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
