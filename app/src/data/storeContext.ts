import { createContext, useContext } from 'react';
import type {
  Difficulty,
  Ingredient,
  MealSlot,
  PantryItem,
  PantryLoc,
  PlanEntry,
  Recipe,
  Shortage,
  ShoppingNeed,
  Unit,
} from '../types';

/**
 * Contrato compartido por las dos capas de datos: `store.tsx` (demo,
 * localStorage) y `supabaseStore.tsx` (real, Supabase). Un único contexto,
 * dos proveedores — las pantallas importan `useData` sin saber cuál está
 * montado.
 */

export interface RecipeIngredientDraft {
  name: string;
  quantity: string;
  unit: Unit;
}

export interface RecipeStepDraft {
  text: string;
  /** Cadena vacía = sin temporizador. */
  timerMinutes: string;
}

export interface RecipeDraft {
  /** Presente al editar una receta ya existente; ausente al crear una nueva. */
  id?: string;
  title: string;
  description: string;
  ingredients: RecipeIngredientDraft[];
  steps: RecipeStepDraft[];
  baseServings: number;
  minutes: string;
  kcal: string;
  difficulty: Difficulty;
  tags: string[];
  /** Ruta ya subida a Storage (bucket `recipe-photos`). Solo en modo real. */
  photoPath?: string;
}

export interface Coverage {
  have: number;
  total: number;
  full: boolean;
}

export interface Store {
  ingredients: Ingredient[];
  recipes: Recipe[];
  pantry: PantryItem[];
  plan: PlanEntry[];
  shoppingChecked: Record<string, boolean>;
  kcalTarget: number;

  recipeById: Map<string, Recipe>;
  ingredientById: Map<string, Ingredient>;

  /** Existencias de un ingrediente en la unidad pedida. */
  stockOf: (ingredientId: string, unit: Unit) => number;
  /** Cantidad que pide una receta para N raciones. */
  needOf: (recipe: Recipe, index: number, servings: number) => number;
  coverageOf: (recipe: Recipe, servings: number) => Coverage;
  needsForWeek: (weekOffset: number) => ShoppingNeed[];

  addPlanEntry: (recipeId: string, date: string, slot: MealSlot, servings?: number) => void;
  removePlanEntry: (id: string) => void;
  /** Async en las dos implementaciones: la real hace una llamada de red. */
  saveRecipe: (draft: RecipeDraft) => Promise<string>;
  pantryBump: (id: string, delta: number) => void;
  pantryDelete: (id: string) => void;
  pantryAdd: (input: { name: string; quantity: number; unit: Unit; location: PantryLoc }) => void;
  toggleShoppingCheck: (key: string) => void;
  buyChecked: (needs: ShoppingNeed[]) => void;
  /**
   * El valor de retorno no lo usa ninguna pantalla hoy (la vista previa de
   * "¿Cómo ha salido?" calcula sus propios shortages con `shortagesFor`,
   * puro y local); se deja tipado por si algún día hace falta.
   */
  finishCook: (input: {
    recipeId: string;
    servings: number;
    planEntryId: string | null;
  }) => Promise<Shortage[]>;
  shortagesFor: (recipe: Recipe, servings: number) => Shortage[];
}

export const StoreCtx = createContext<Store | null>(null);

export function useData(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}
