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
  /** `null` cuando `toTaste`: "sal al gusto" no lleva cantidad. */
  quantity: number | null;
  unit: Unit | null;
  /** Sin cantidad fija (sal, pimienta...). Ausente = false. */
  toTaste?: boolean;
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
  /** Presente si esta receta viene de guardar una idea del catálogo (pestaña Ideas). */
  sourceIdeaId?: string;
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
  /** Cualquier número de miembros puede ser administrador (`profile.is_admin`), no solo uno. */
  isAdmin: boolean;
}

/** Detalle de hogar para la hoja "Tu hogar" (nombre, miembros). */
export interface HouseholdDetail {
  id: string;
  name: string;
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
  /** Token de una lista de komprapp (repo `ShoppingList`) vinculada a este hogar, o `null` si no hay ninguna. */
  komprappListToken: string | null;
}

/**
 * Dos espacios de identificadores distintos que son los dos `uuid`: el de
 * `profile` (cuenta, hogar, rol de admin) y el de `member` (identidad de
 * producto, incluidos los que no tienen cuenta). Marcarlos hace que el
 * compilador se acuerde de la diferencia dentro de seis meses; mezclarlos
 * escribe en la fila de otra persona sin que nada falle en tiempo de
 * ejecución.
 */
export type ProfileId = string & { readonly __profile: unique symbol };
export type MemberId = string & { readonly __member: unique symbol };

export const asProfileId = (v: string): ProfileId => v as ProfileId;
export const asMemberId = (v: string): MemberId => v as MemberId;

/** Miembro del hogar, tenga cuenta o no. */
export interface Member {
  id: MemberId;
  /** `null` si es un miembro sin cuenta (tutelado). */
  authUserId: ProfileId | null;
  /** Solo los tutelados se pueden editar y borrar por otros miembros. */
  isWard: boolean;
  displayName: string;
  /** Ruta en el bucket `avatars`, o `null` para pintar la inicial. */
  avatarPath: string | null;
  color: Accent;
  sortOrder: number;
  kcalTarget: number;
  /** No null = ya no está en el hogar. Se sigue leyendo para la atribución. */
  deletedAt: string | null;
}

/** Datos corporales de un miembro. Privados: solo suyos, o de quien le tutela. */
export interface MemberBody {
  sex: 'female' | 'male' | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
}

/**
 * Qué avisos quiere recibir un miembro y cuándo (diseño §9,
 * `member_notify_pref`). Privado, mismo nivel que `MemberBody`: solo el
 * propio, o el de un tutelado — pero a diferencia del cuerpo, un tutelado
 * (sin cuenta) nunca llega a usarlo de verdad, porque no hay dónde
 * enviarle un aviso.
 */
export interface NotifyPref {
  /** Temporizadores de cocina. Exento de `quietFrom`/`quietTo` por diseño. */
  timers: boolean;
  expiring: boolean;
  cookTurn: boolean;
  /** Apagado por defecto: una app que da la lata sin que se lo pidas se desinstala. */
  logReminder: boolean;
  /** Hora local, tal como la devuelve Postgres para una columna `time` ('HH:MM' o 'HH:MM:SS'). */
  logReminderAt: string;
  /** `null` en cualquiera de los dos = sin horas de silencio configuradas. */
  quietFrom: string | null;
  quietTo: string | null;
}

/** Algo que alguien comió fuera del plan. */
export interface IntakeExtra {
  id: string;
  memberId: MemberId;
  /** Fecha ISO local, `YYYY-MM-DD`. */
  date: string;
  label: string;
  kcal: number;
  source: 'manual' | 'recipe' | 'barcode';
  recipeId: string | null;
}

export interface ExtraInput {
  memberId: MemberId;
  date: string;
  label: string;
  kcal: number;
  source: 'manual' | 'recipe' | 'barcode';
  recipeId?: string | null;
}

/** Un extra que alguien repite. Derivado de `intake_extra`, no es una tabla. */
export interface FrequentExtra {
  label: string;
  kcal: number;
  times: number;
}
