import { createContext, useContext } from 'react';
import type {
  Accent,
  Difficulty,
  ExtraInput,
  FrequentExtra,
  HouseholdDetail,
  Ingredient,
  MealSlot,
  Member,
  MemberBody,
  MemberId,
  PantryItem,
  PantryLoc,
  PlanEntry,
  Recipe,
  Shortage,
  ShoppingNeed,
  Unit,
} from '../types';
import type { DayIntake, DayTotal } from '../domain/intake';

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

export interface MemberSettingsPatch {
  displayName?: string;
  color?: Accent;
  avatarPath?: string | null;
  sortOrder?: number;
  kcalTarget?: number;
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

  /**
   * Miembros del hogar, **incluidos los borrados**: hacen falta para poner
   * nombre a lo que dejaron hecho. Filtra por `deletedAt === null` en
   * cualquier lista que el usuario vaya a tocar.
   */
  members: Member[];
  /**
   * El miembro que corresponde a la sesión. `null` mientras carga en modo
   * real; en demo vale siempre `MEMBERS[0].id` (Ana, la primera del seed) —
   * no `null`, porque sí hay "yo" en demo, solo que sin cuenta real detrás.
   */
  myMemberId: MemberId | null;

  /** Contrato: `rpc/create_ward_member`. Solo admins. Devuelve el id nuevo. */
  createWardMember: (displayName: string, color: Accent) => Promise<MemberId>;
  /**
   * Contrato: `rpc/delete_ward_member`. Solo admins, y solo sobre miembros
   * SIN cuenta: a quien tiene cuenta se le saca con `removeMember`.
   */
  deleteWardMember: (memberId: MemberId) => Promise<void>;
  /**
   * Contrato: `rpc/set_member_settings`. Escribe la lista blanca
   * (`displayName`, `color`, `avatarPath`, `sortOrder`, `kcalTarget`) del
   * miembro propio o de un tutelado del hogar. El servidor ignora cualquier
   * otra clave.
   */
  setMemberSettings: (memberId: MemberId, patch: MemberSettingsPatch) => Promise<void>;

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
  deleteRecipe: (recipeId: string) => void;
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
   * Contrato: `rpc/demote_admin(p_member_id)`. Solo un administrador; quita el
   * rol a otro administrador del mismo hogar (nunca a uno mismo) y anula sus
   * invitaciones pendientes.
   */
  demoteAdmin: (memberId: string) => Promise<void>;
  /**
   * Contrato: `rpc/remove_member(p_member_id)`. Solo un administrador; saca
   * del hogar a otro miembro que no sea admin (a un admin hay que quitarle
   * antes el rol: rechaza con `REZET_TARGET_IS_ADMIN:`). Mismo resultado que
   * si esa persona hubiera salido con `leave_household`.
   */
  removeMember: (memberId: string) => Promise<void>;
  /**
   * Contrato: `rpc/set_komprapp_list_token`. Vincula (token no nulo) o
   * desvincula (`null`) la lista de komprapp del hogar actual. Solo un
   * ADMIN del hogar puede llamarlo — mismo nivel que `deleteHousehold`,
   * porque redirige la lista de la compra de todo el hogar. La RPC rechaza
   * la llamada (error) si quien la hace no es admin; la UI (Tarea 5) debe
   * ocultar o deshabilitar el botón para no-admins en vez de dejar que
   * fallen al intentarlo.
   */
  setKomprappListToken: (token: string | null) => Promise<void>;
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

  /** Datos corporales del miembro propio. `null` si no hay o no hay acceso. */
  myBody: MemberBody | null;
  /**
   * `true` mientras la consulta de datos corporales está en curso (solo la
   * primera carga, no cada refetch en segundo plano). Antes de que resuelva,
   * `myBody` vale `null` igual que "no hay datos guardados" — sin esta señal
   * un formulario no puede distinguir "todavía no sé" de "no hay nada", y
   * guardar en esa ventana borraría en silencio datos que sí existen.
   */
  myBodyLoading: boolean;
  /**
   * Contrato: `rpc/set_member_body`. El objetivo va YA CALCULADO con
   * `domain/nutrition.ts`: la fórmula vive ahí y solo ahí.
   */
  setMyBody: (memberId: MemberId, patch: Partial<MemberBody>, kcalTarget: number | null) => Promise<void>;

  /** Puro, sobre datos ya descargados. Ver `domain/intake.ts`. */
  intakeOfDayFor: (memberId: MemberId, date: string) => DayIntake;
  /** Raciones de un miembro en una comida del plan. 0 = no la comió. */
  setShare: (memberId: MemberId, planEntryId: string, servings: number) => Promise<void>;
  addExtra: (input: ExtraInput) => Promise<string>;
  removeExtra: (id: string) => Promise<void>;
  /** Los que más repite, derivados de su historial. No hay tabla de favoritos. */
  frequentExtras: (memberId: MemberId) => FrequentExtra[];
  /** Totales por día para la pantalla de progreso. */
  weekTotalsFor: (memberId: MemberId, dates: string[]) => DayTotal[];
}

export const StoreCtx = createContext<Store | null>(null);

export function useData(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}
