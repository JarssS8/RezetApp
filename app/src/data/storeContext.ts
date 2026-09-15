import { createContext, useContext } from 'react';
import type {
  Difficulty,
  HouseholdDetail,
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
  /** "Al gusto": oculta cantidad/unidad en el formulario, se guarda sin cifra. */
  toTaste: boolean;
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
  /** Al guardar una idea del catálogo: enlaza la copia con su origen (ver `Recipe.sourceIdeaId`). */
  sourceIdeaId?: string;
}

export interface Coverage {
  have: number;
  total: number;
  full: boolean;
}

export interface Store {
  ingredients: Ingredient[];
  recipes: Recipe[];
  /** Etiquetas realmente en uso en el hogar, para filtrar y para sugerir al crear. */
  knownTags: string[];
  pantry: PantryItem[];
  plan: PlanEntry[];
  shoppingChecked: Record<string, boolean>;
  kcalTarget: number;
  /**
   * Nombre, propietario y miembros del hogar actual, para la hoja "Tu
   * hogar". `null` mientras se carga en modo real; el modo demo devuelve un
   * valor mínimo siempre (nunca se llega a mostrar: la entrada de Ajustes
   * que abre esta hoja no se renderiza en demo).
   */
  household: HouseholdDetail | null;

  recipeById: Map<string, Recipe>;
  ingredientById: Map<string, Ingredient>;

  /** Existencias de un ingrediente en la unidad pedida. */
  stockOf: (ingredientId: string, unit: Unit) => number;
  /** Cantidad que pide una receta para N raciones. `null` si el ingrediente es "al gusto". */
  needOf: (recipe: Recipe, index: number, servings: number) => number | null;
  coverageOf: (recipe: Recipe, servings: number) => Coverage;
  needsForWeek: (weekOffset: number) => ShoppingNeed[];

  addPlanEntry: (recipeId: string, date: string, slot: MealSlot, servings?: number) => void;
  removePlanEntry: (id: string) => void;
  /** Async en las dos implementaciones: la real hace una llamada de red. */
  saveRecipe: (draft: RecipeDraft) => Promise<string>;
  pantryBump: (id: string, delta: number) => void;
  pantryDelete: (id: string) => void;
  pantryAdd: (input: {
    name: string;
    quantity: number;
    unit: Unit;
    location: PantryLoc;
    expiresOn?: string;
  }) => Promise<{ id: string; merged: boolean; addedQuantity: number }>;
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

  /**
   * Contrato: `rpc/leave_household`. Borra la fila `profile` propia. Rechaza
   * (mensaje ya en español, listo para mostrar) si eres el único miembro
   * (hay que borrar el hogar en vez de salir) o si eres el único
   * administrador y quedan otros miembros (dale el rol a alguien más antes).
   */
  leaveHousehold: () => Promise<void>;
  /**
   * Contrato: `rpc/delete_household`. Cualquier administrador (no solo un
   * propietario único: cualquier número de miembros puede ser admin). Borra
   * el profile de todos los miembros y luego el hogar (cascada). Rechaza si
   * no eres administrador.
   */
  deleteHousehold: () => Promise<void>;
  /**
   * Contrato: `rpc/promote_admin(p_member_id)`. Solo lo puede llamar un
   * administrador; hace administrador a otro miembro del mismo hogar. No
   * pasa nada si el objetivo ya lo era.
   */
  promoteAdmin: (memberId: string) => Promise<void>;
  /**
   * Contrato: `rpc/delete_account`. Borra la cuenta de Auth de quien llama
   * de verdad (no solo el profile): irreversible, sin recuperación. Rechaza
   * si eres el único administrador y quedan otros miembros. Si eres el
   * único miembro del hogar, también borra el hogar entero como parte de la
   * misma operación.
   */
  deleteAccount: () => Promise<void>;

  /**
   * Señal desde la UI de que la hoja "Tu hogar" (o el flujo de salir/
   * eliminar que cuelga de ella) está abierta. La implementación real la
   * usa para gatear el fetch de la lista de miembros del hogar — casi
   * ninguna sesión abre esa hoja, así que no tiene sentido pedirla en cada
   * login (ver `householdMembersQ` en `supabaseStore.tsx`). El modo demo no
   * hace nada.
   */
  setHouseholdSheetOpen: (open: boolean) => void;
}

export const StoreCtx = createContext<Store | null>(null);

export function useData(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}
