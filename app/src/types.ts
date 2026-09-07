export type Unit = 'g' | 'ml' | 'ud' | 'tbsp';
export type FoodGroup = 'fresco' | 'seco' | 'conserva';
export type PantryLoc = 'cupboard' | 'fridge' | 'freezer';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Difficulty = 'easy' | 'medium' | 'hard';

export type Locale = 'es' | 'en';
export type Theme = 'system' | 'light' | 'dark';
export type Accent = 'green' | 'amber' | 'coral' | 'blue' | 'pink' | 'violet' | 'teal';
export type UnitSystem = 'metric' | 'imperial';

/** Texto bilingüe. En datos creados por el usuario ambos campos son iguales. */
export interface Localized {
  es: string;
  en: string;
}

/** Alimento canónico. Despensa y recetas apuntan aquí por id, nunca por texto. */
export interface Ingredient {
  id: string;
  name: Localized;
  group: FoodGroup;
  /** Sal, especias, levadura: no escalan linealmente. */
  sensitive: boolean;
  defaultUnit: Unit;
}

export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit: Unit;
}

export interface RecipeStep {
  text: Localized;
  timerMinutes?: number;
  /** Ingredientes que pide el paso. Si falta, se deduce del texto. */
  ingredientIds?: string[];
}

export interface Recipe {
  id: string;
  name: Localized;
  description: Localized;
  baseServings: number;
  minutes: number;
  difficulty: Difficulty;
  kcalPerServing: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  cookedCount: number;
  photoUrl?: string;
}

export interface PantryItem {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: Unit;
  location: PantryLoc;
  /** Días hasta caducar. null = sin fecha. */
  expiresInDays: number | null;
}

export interface PlanEntry {
  id: string;
  /** Fecha ISO local, `YYYY-MM-DD`. */
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
  cooked: boolean;
}

export interface Shortage {
  name: string;
  quantity: number;
  unit: Unit;
}

/**
 * Temporizador de cocina. `endsAt` es un instante absoluto (epoch ms), no
 * segundos restantes: así sigue siendo correcto si la pantalla se apaga o la
 * pestaña se duerme. `endsAt === null` significa pausado en `remaining`.
 */
export interface CookTimer {
  totalSeconds: number;
  remainingSeconds: number;
  endsAt: number | null;
}

export type CookPhase = 'mise' | 'steps';

export interface CookSession {
  recipeId: string;
  servings: number;
  phase: CookPhase;
  step: number;
  /** Índices de `recipe.ingredients` marcados. */
  checked: Record<number, boolean>;
  /** Índice de paso -> temporizador. */
  timers: Record<number, CookTimer>;
  /** Entrada de plan que se está cocinando, si viene de una. */
  planEntryId: string | null;
  showUpcoming: boolean;
  askExit: boolean;
}

export interface ShoppingNeed {
  key: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: Unit;
  group: FoodGroup;
}

/** Miembro de un hogar, tal y como se ve en la hoja "Tu hogar". */
export interface HouseholdMember {
  id: string;
  displayName: string;
}

/**
 * Detalle de hogar para la hoja "Tu hogar" (nombre, propietario, miembros).
 * `ownerId` puede ser `null` en datos heredados de antes de que existiera la
 * columna `household.owner_id` (se hace backfill, pero por si acaso).
 */
export interface HouseholdDetail {
  id: string;
  name: string;
  ownerId: string | null;
  members: HouseholdMember[];
  /**
   * `false` mientras `members` todavía no refleja la lista real (la
   * implementación real la carga aparte, sin bloquear el gate `ready` — ver
   * `supabaseStore.tsx`). El modo demo es siempre `true`. Cualquier cálculo
   * derivado de `members` (p. ej. "cuántas otras personas hay") debe
   * esperar a que esto sea `true` para no mostrar un número silenciosamente
   * erróneo.
   */
  membersLoaded: boolean;
}
