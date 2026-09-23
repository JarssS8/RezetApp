import { useCallback, useEffect, useMemo } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { scaleQuantity } from '../domain/scaling';
import { addDays, dateKey, resolveExpiry, slotForNow, todayKey } from '../domain/dates';
import { SENSITIVE_RE, defaultLocationFor, inferFoodGroup } from '../domain/recipeText';
import { entriesOfDay } from '../domain/shopping';
import {
  frequentExtrasOf,
  intakeOfDay,
  weekTotals,
  type DayIntake,
  type DayTotal,
  type IntakeExtraLine,
} from '../domain/intake';
import { createStoreDerivations } from '../domain/deriveStore';
import { normalizeLayout, type WidgetItem } from '../domain/dashboard';
import { INGREDIENTS, INTAKE_EXTRAS, KCAL_TARGET, MEMBER_BODY, MEMBERS, PANTRY, PLAN, RECIPES } from './seed';
import { usePrefs } from '../store/prefs';
import { asMemberId, type Accent } from '../types';
import { StoreCtx, type MemberSettingsPatch, type RecipeDraft, type Store } from './storeContext';
import type {
  ExtraInput,
  FrequentExtra,
  HouseholdDetail,
  Ingredient,
  IntakeExtra,
  MealSlot,
  Member,
  MemberBody,
  MemberId,
  NotifyPref,
  PantryItem,
  PantryLoc,
  PlanEntry,
  Recipe,
  RecipePref,
  RecipeRating,
  Shortage,
  ShoppingNeed,
  ShoppingTurn,
  Unit,
} from '../types';

/**
 * Capa de datos del modo DEMO: todo en memoria + localStorage, sin red.
 *
 * La implementación real (Supabase) vive en `supabaseStore.tsx` e implementa
 * el mismo contrato `Store` de `storeContext.ts`. `App.tsx` decide cuál de
 * los dos proveedores monta; las pantallas solo conocen `useData()`.
 */

/**
 * Forma interna persistida: guarda la fecha real (`expiresOn`), no el
 * número de días derivado. `expiresInDays` se recalcula en cada lectura
 * (ver `pantryExposed` más abajo) — igual que `mapPantryItem` ya hace para
 * el backend real — para que no se quede congelado en localStorage.
 */
type StoredPantryItem = Omit<PantryItem, 'expiresInDays'> & { expiresOn: string | null };

const toStoredPantry = (items: PantryItem[]): StoredPantryItem[] =>
  items.map(({ expiresInDays, ...rest }) => ({
    ...rest,
    expiresOn: expiresInDays != null ? dateKey(addDays(new Date(), expiresInDays)) : null,
  }));

interface Data {
  ingredients: Ingredient[];
  recipes: Recipe[];
  pantry: StoredPantryItem[];
  plan: PlanEntry[];
  shoppingChecked: Record<string, boolean>;
  kcalTarget: number;
  /** Incluye a los borrados, igual que el contrato `Store` exige — ver storeContext.ts. */
  members: Member[];
  /**
   * Datos corporales por miembro. Como en la tabla real, no toda fila de
   * `members` tiene una aquí: sin cuerpo registrado, `bodyOf(id)` da `null`
   * (ver contrato en `storeContext.ts`), no un objeto con todo a `null`.
   */
  memberBody: Partial<Record<MemberId, MemberBody>>;
  /**
   * Excepciones a "una ración por persona" (ver `domain/intake.ts`). Un
   * array y no un mapa anidado porque así se persiste tal cual en JSON; la
   * clave real (miembro + entrada de plan) se resuelve al leer.
   */
  intakeShares: { memberId: MemberId; planEntryId: string; servings: number }[];
  /** Historial completo de extras — la demo es pequeña, no hace falta acotar por semana como la capa real. */
  intakeExtras: IntakeExtra[];
  /**
   * Preferencias de aviso por miembro (`member_notify_pref` en la capa
   * real). Igual que `memberBody`: sin fila para un miembro, el contrato
   * (`notifyPref`, siempre el del "yo" de la demo) da `null` — la pantalla
   * de Ajustes es quien decide qué valores por defecto enseñar en ese caso.
   */
  notifyPrefByMember: Partial<Record<MemberId, NotifyPref>>;
  /** Igual que `notifyPrefByMember`: por miembro, para que la demo enseñe lo
   * mismo que la real. Sin entrada, el layout por defecto. */
  dashboardByMember: Partial<Record<MemberId, WidgetItem[]>>;
  /**
   * Valoraciones de recetas (`member_recipe_pref` en la capa real). Una
   * lista plana y no un mapa anidado, mismo motivo que `intakeShares`: así
   * se persiste tal cual en JSON. Como mucho una fila por (miembro,
   * receta) — la clave primaria real.
   */
  recipePrefs: Array<{ memberId: MemberId; recipeId: string; rating: RecipeRating }>;
  /** Turnos (§10), apagados por defecto — ver `HouseholdDetail.turnsEnabled` en `types.ts`. */
  turnsEnabled: boolean;
  /**
   * A quién le toca la compra de cada semana. Una lista plana, no un mapa
   * anidado — mismo motivo que `intakeShares`/`recipePrefs`: así se
   * persiste tal cual en JSON. Como mucho una fila por semana (misma clave
   * real que `shopping_turn`).
   */
  shoppingTurns: ShoppingTurn[];
}

const INITIAL: Data = {
  ingredients: INGREDIENTS,
  recipes: RECIPES,
  pantry: toStoredPantry(PANTRY),
  plan: PLAN,
  shoppingChecked: {},
  kcalTarget: KCAL_TARGET,
  members: MEMBERS,
  memberBody: { [MEMBERS[0]!.id]: MEMBER_BODY },
  intakeShares: [],
  intakeExtras: INTAKE_EXTRAS,
  notifyPrefByMember: {},
  dashboardByMember: {},
  recipePrefs: [],
  turnsEnabled: false,
  shoppingTurns: [],
};

/**
 * Valores por defecto del diseño (§9, migración
 * `20260921100000_rezet_notify_pref.sql`): todo activado salvo el
 * recordatorio de registro (una app que da la lata sin que se lo pidas se
 * desinstala) y sin horas de silencio configuradas. Solo se usa para
 * fusionar un patch la primera vez que se toca el ajuste — igual que hace
 * `upsert` en la capa real al insertar una fila nueva con columnas por
 * defecto —, nunca se expone directamente como `notifyPref`.
 */
const DEFAULT_NOTIFY_PREF: NotifyPref = {
  timers: true,
  expiring: true,
  cookTurn: true,
  logReminder: false,
  logReminderAt: '21:00',
  quietFrom: null,
  quietTo: null,
};

/**
 * La demo no tiene sesión, así que no hay un `auth.uid()` con el que elegir
 * "quién soy": se fija a la primera fila del seed, igual que `DEMO_HOUSEHOLD`
 * fija el hogar. No se deriva de `data.members` en cada render porque el id
 * nunca cambia (crear/borrar tutelados no toca esta fila).
 */
const DEMO_MY_MEMBER_ID: MemberId = MEMBERS[0]!.id;

export type { RecipeDraft, Coverage, Store } from './storeContext';
export { useData } from './storeContext';

const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

/**
 * El modo demo no tiene concepto real de hogar multi-usuario (no hay
 * sesión, no hay otros miembros). `household` se rellena con un valor
 * mínimo de un solo miembro solo para satisfacer el contrato `Store` — la
 * hoja "Tu hogar" SÍ se monta en demo (ver miembros, editarlos, añadir o
 * quitar tutelados), pero sin "Salir del hogar" ni "Eliminar hogar"
 * (`HouseholdSheet` no los pinta si `App.tsx` no le pasa esos dos
 * callbacks, mismo patrón que `onInvite` en `AccountHouseholdSheet`).
 * `leaveHousehold`/`deleteHousehold` son alcanzables solo si algo llama a
 * estas funciones sin pasar por esa UI, así que rechazan con un mensaje
 * claro en vez de fingir que hacen algo.
 */
const DEMO_HOUSEHOLD: HouseholdDetail = {
  id: 'demo',
  name: 'Demo',
  members: [{ id: 'demo-user', displayName: 'Tú', isAdmin: true }],
  membersLoaded: true,
  komprappListToken: null,
  // Valor de relleno: `value` de más abajo lo sustituye por `data.turnsEnabled`
  // (el de verdad, persistido) antes de exponerlo — ver el mismo patrón que
  // ya usa `pantry`/`pantryExposed`.
  turnsEnabled: false,
};

async function demoHouseholdActionUnavailable(): Promise<never> {
  throw new Error('No disponible en el modo demo.');
}

async function demoMemberActionUnavailable(_memberId: string): Promise<void> {
  throw new Error('No disponible en el modo demo.');
}

/** El modo demo no tiene ninguna query real que gatear. */
function demoSetHouseholdSheetOpen(): void {}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = usePersistentState<Data>('rezet.data', INITIAL);
  const { locale } = usePrefs();

  // `rezet.data` es un blob persistido: una demo ya usada nunca vuelve a leer
  // `seed.ts` para sus recetas. Rellena aquí lo que el seed haya ganado desde
  // entonces (p. ej. fotos) sin tocar nada que el usuario ya haya cambiado.
  useEffect(() => {
    setData((d) => {
      let changed = false;
      const recipes = d.recipes.map((r) => {
        if (r.photoUrl) return r;
        const seeded = RECIPES.find((sr) => sr.id === r.id);
        if (!seeded?.photoUrl) return r;
        changed = true;
        return { ...r, photoUrl: seeded.photoUrl };
      });
      return changed ? { ...d, recipes } : d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pantryExposed = useMemo<PantryItem[]>(
    () =>
      data.pantry.map(({ expiresOn, ...rest }) => ({
        ...rest,
        expiresInDays: resolveExpiry(expiresOn),
      })),
    [data.pantry],
  );

  const recipeById = useMemo(
    () => new Map(data.recipes.map((r) => [r.id, r])),
    [data.recipes],
  );
  const ingredientById = useMemo(
    () => new Map(data.ingredients.map((i) => [i.id, i])),
    [data.ingredients],
  );
  const knownTags = useMemo(
    () => Array.from(new Set(data.recipes.flatMap((r) => r.tags))),
    [data.recipes],
  );

  const { stockOf, needOf, coverageOf, needsForWeek, shortagesFor } = useMemo(
    () =>
      createStoreDerivations({
        pantry: pantryExposed,
        recipeById,
        ingredientById,
        plan: data.plan,
        locale,
      }),
    [pantryExposed, data.plan, recipeById, ingredientById, locale],
  );

  const addPlanEntry = useCallback(
    (recipeId: string, date: string, slot: MealSlot, servings?: number) => {
      setData((d) => {
        const recipe = d.recipes.find((r) => r.id === recipeId);
        if (!recipe) return d;
        const next: PlanEntry = {
          id: uid('pe'),
          date,
          slot,
          recipeId,
          servings: servings ?? recipe.baseServings,
          cooked: false,
          cookMemberId: null,
        };
        return { ...d, plan: [...d.plan, next] };
      });
    },
    [setData],
  );

  const removePlanEntry = useCallback(
    (id: string) => setData((d) => ({ ...d, plan: d.plan.filter((e) => e.id !== id) })),
    [setData],
  );

  /** Resuelve un nombre contra el catálogo, creando el alimento si no existe. */
  const resolveIngredient = useCallback(
    (
      list: Ingredient[],
      name: string,
      unit: Unit,
    ): { list: Ingredient[]; id: string } => {
      const found = list.find(
        (i) => i.name.es.toLowerCase() === name.toLowerCase() || i.name.en.toLowerCase() === name.toLowerCase(),
      );
      if (found) return { list, id: found.id };
      const created: Ingredient = {
        id: uid('ing'),
        name: { es: name, en: name },
        group: inferFoodGroup(name),
        defaultUnit: unit,
        sensitive: SENSITIVE_RE.test(name),
      };
      return { list: [...list, created], id: created.id };
    },
    [],
  );

  const saveRecipe = useCallback(
    async (draft: RecipeDraft) => {
      const id = draft.id ?? uid('r');
      setData((d) => {
        let ingredients = d.ingredients;
        const recipeIngredients = draft.ingredients
          .filter((ri) => ri.name.trim())
          .map((ri) => {
            const resolved = resolveIngredient(ingredients, ri.name.trim(), ri.unit);
            ingredients = resolved.list;
            return {
              ingredientId: resolved.id,
              quantity: ri.toTaste ? null : parseFloat(ri.quantity.replace(',', '.')) || 1,
              unit: ri.toTaste ? null : ri.unit,
              toTaste: ri.toTaste,
            };
          });
        const steps = draft.steps
          .filter((s) => s.text.trim())
          .map((s) => {
            const minutes = parseInt(s.timerMinutes, 10);
            return {
              text: { es: s.text.trim(), en: s.text.trim() },
              ...(minutes > 0 ? { timerMinutes: minutes } : {}),
            };
          });

        const recipeFields = {
          name: { es: draft.title, en: draft.title },
          description: { es: draft.description, en: draft.description },
          baseServings: draft.baseServings,
          minutes: parseInt(draft.minutes, 10) || 20,
          difficulty: draft.difficulty,
          kcalPerServing: parseInt(draft.kcal, 10) || 450,
          ...(draft.sourceIdeaId ? { sourceIdeaId: draft.sourceIdeaId } : {}),
          tags: draft.tags,
          ingredients: recipeIngredients.length
            ? recipeIngredients
            : [{ ingredientId: ingredients[0]!.id, quantity: 1, unit: 'ud' as Unit }],
          steps: steps.length ? steps : [{ text: { es: '—', en: '—' } }],
        };

        if (draft.id) {
          const recipes = d.recipes.map((r) => (r.id === draft.id ? { ...r, ...recipeFields } : r));
          return { ...d, ingredients, recipes };
        }

        const recipe: Recipe = { id, ...recipeFields, cookedCount: 0 };
        return { ...d, ingredients, recipes: [recipe, ...d.recipes] };
      });
      return id;
    },
    [resolveIngredient, setData],
  );

  const deleteRecipe = useCallback(
    (id: string) =>
      setData((d) => ({
        ...d,
        recipes: d.recipes.filter((r) => r.id !== id),
        plan: d.plan.filter((e) => e.recipeId !== id),
      })),
    [setData],
  );

  const pantryBump = useCallback(
    (id: string, delta: number) =>
      setData((d) => ({
        ...d,
        pantry: d.pantry
          .map((p) => (p.id === id ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p))
          .filter((p) => p.quantity > 0),
      })),
    [setData],
  );

  const pantryDelete = useCallback(
    (id: string) => setData((d) => ({ ...d, pantry: d.pantry.filter((p) => p.id !== id) })),
    [setData],
  );

  const pantryAdd = useCallback(
    async (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) => {
      // Se genera fuera del updater de setData a propósito: bajo
      // <StrictMode>, React invoca el updater dos veces en desarrollo, y un
      // uid() generado DENTRO del updater daría dos ids distintos entre lo
      // que esta función devuelve y lo que React realmente guarda —
      // rompiendo el deshacer en silencio.
      const newId = uid('p');
      let result!: { id: string; merged: boolean; addedQuantity: number };
      setData((d) => {
        const resolved = resolveIngredient(d.ingredients, input.name, input.unit);
        const existing = d.pantry.find(
          (p) => p.ingredientId === resolved.id && p.unit === input.unit && p.location === input.location,
        );
        if (existing) {
          result = { id: existing.id, merged: true, addedQuantity: input.quantity };
          const pantry = d.pantry.map((p) =>
            p.id === existing.id
              ? { ...p, quantity: p.quantity + input.quantity, expiresOn: p.expiresOn ?? input.expiresOn ?? null }
              : p,
          );
          return { ...d, ingredients: resolved.list, pantry };
        }
        result = { id: newId, merged: false, addedQuantity: input.quantity };
        const item: StoredPantryItem = {
          id: newId,
          ingredientId: resolved.id,
          quantity: input.quantity,
          unit: input.unit,
          location: input.location,
          expiresOn: input.expiresOn ?? null,
        };
        return { ...d, ingredients: resolved.list, pantry: [...d.pantry, item] };
      });
      return result;
    },
    [resolveIngredient, setData],
  );

  const toggleShoppingCheck = useCallback(
    (key: string) =>
      setData((d) => ({
        ...d,
        shoppingChecked: { ...d.shoppingChecked, [key]: !d.shoppingChecked[key] },
      })),
    [setData],
  );

  /** Contrato: `rpc/buy_checked`. Suma a la despensa y limpia las marcas. */
  const buyChecked = useCallback(
    (needs: ShoppingNeed[]) =>
      setData((d) => {
        const pantry = d.pantry.map((p) => ({ ...p }));
        for (const need of needs) {
          if (!d.shoppingChecked[need.key]) continue;
          const existing = pantry.find(
            (p) => p.ingredientId === need.ingredientId && p.unit === need.unit,
          );
          if (existing) existing.quantity += need.quantity;
          else
            pantry.push({
              id: uid('p'),
              ingredientId: need.ingredientId,
              quantity: need.quantity,
              unit: need.unit,
              location: defaultLocationFor(need.group),
              expiresOn: null,
            });
        }
        return { ...d, pantry, shoppingChecked: {} };
      }),
    [setData],
  );

  /**
   * Contrato: `rpc/finish_cook_v2`. En una sola operación: resta de la despensa
   * lo escalado, incrementa el contador, marca la entrada de plan (o crea una
   * de hoy), escribe el reparto de raciones por miembro ("Cuenta para" en
   * `CookFinishSheet`) y devuelve lo que faltaba.
   */
  const finishCook = useCallback(
    async (input: {
      recipeId: string;
      servings: number;
      planEntryId: string | null;
      shares: { memberId: MemberId; servings: number }[];
    }): Promise<Shortage[]> => {
      const recipe = recipeById.get(input.recipeId);
      if (!recipe) return [];
      const shortages = shortagesFor(recipe, input.servings);

      // Generado fuera del updater, mismo motivo que en `pantryAdd`/
      // `createWardMember`: bajo <StrictMode> el updater se invoca dos veces
      // en desarrollo, y el id de la entrada de plan tiene que ser el mismo
      // que el que usan las raciones escritas más abajo en la misma llamada.
      const newPlanEntryId = uid('pe');

      setData((d) => {
        const pantry = d.pantry.map((p) => ({ ...p }));
        recipe.ingredients.forEach((ri) => {
          // "Al gusto": nada que descontar de la despensa, igual que rpc/finish_cook.
          if (ri.toTaste || ri.quantity == null || ri.unit == null) return;
          const sensitive = d.ingredients.find((i) => i.id === ri.ingredientId)?.sensitive ?? false;
          const need = scaleQuantity(ri.quantity, recipe.baseServings, input.servings, sensitive);
          const item = pantry.find((p) => p.ingredientId === ri.ingredientId && p.unit === ri.unit);
          if (item) item.quantity = Math.max(0, item.quantity - need);
        });

        const recipes = d.recipes.map((r) =>
          r.id === recipe.id ? { ...r, cookedCount: r.cookedCount + 1 } : r,
        );

        let plan = d.plan;
        const existing = input.planEntryId
          ? d.plan.find((e) => e.id === input.planEntryId)
          : undefined;
        const planEntryId = existing ? existing.id : newPlanEntryId;
        if (existing) {
          // Idempotencia: si ya estaba cocinada, no se vuelve a restar.
          plan = d.plan.map((e) =>
            e.id === existing.id ? { ...e, cooked: true, servings: input.servings } : e,
          );
        } else {
          plan = [
            ...d.plan,
            {
              id: newPlanEntryId,
              date: todayKey(),
              slot: slotForNow(),
              recipeId: recipe.id,
              servings: input.servings,
              cooked: true,
              cookMemberId: null,
            },
          ];
        }

        // Igual que `finish_cook_v2`: las raciones se escriben en la misma
        // operación que descuenta la despensa, nunca en una llamada aparte.
        const intakeShares = [
          ...d.intakeShares.filter((s) => s.planEntryId !== planEntryId),
          ...input.shares.map((s) => ({ memberId: s.memberId, planEntryId, servings: s.servings })),
        ];

        return { ...d, pantry: pantry.filter((p) => p.quantity > 0), recipes, plan, intakeShares };
      });

      return shortages;
    },
    [recipeById, shortagesFor, setData],
  );

  /**
   * Contrato: `rpc/create_ward_member`. La UI (`HouseholdSheet`) ya gatea el
   * botón de añadir tutelado a quien sale administrador, así que aquí solo
   * se construye la fila sin repetir esa comprobación. El objetivo de kcal
   * por defecto es el del hogar, igual que hace la RPC real.
   */
  const createWardMember = useCallback(
    async (displayName: string, color: Accent): Promise<MemberId> => {
      // Generado fuera del updater por el mismo motivo que `pantryAdd`:
      // <StrictMode> invoca el updater dos veces en desarrollo, y un id
      // generado dentro daría dos valores distintos entre lo que esta
      // función devuelve y lo que React acaba guardando.
      const newId = asMemberId(uid('member'));
      setData((d) => {
        const nextSortOrder = d.members.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1;
        const member: Member = {
          id: newId,
          authUserId: null,
          isWard: true,
          displayName: displayName.trim(),
          avatarPath: null,
          color,
          sortOrder: nextSortOrder,
          kcalTarget: d.kcalTarget,
          deletedAt: null,
        };
        return { ...d, members: [...d.members, member] };
      });
      return newId;
    },
    [setData],
  );

  /**
   * Contrato: `rpc/delete_ward_member`. Borrado lógico (`deletedAt`), nunca
   * se quita la fila: su historial sigue necesitando un nombre al que
   * apuntar. Igual que la RPC real, solo actúa sobre tutelados — a quien
   * tiene cuenta se le saca del hogar por otra vía, inexistente en demo.
   */
  const deleteWardMember = useCallback(
    async (memberId: MemberId): Promise<void> => {
      setData((d) => {
        const target = d.members.find((m) => m.id === memberId);
        if (!target || !target.isWard || target.deletedAt) return d;
        const members = d.members.map((m) =>
          m.id === memberId ? { ...m, deletedAt: new Date().toISOString() } : m,
        );
        return { ...d, members };
      });
    },
    [setData],
  );

  /**
   * Contrato: `rpc/set_member_settings`. Solo se tocan las claves presentes
   * en el patch — enviar `undefined` como si fuera un borrado machacaría
   * datos que el llamante ni siquiera quería tocar.
   */
  const setMemberSettings = useCallback(
    async (memberId: MemberId, patch: MemberSettingsPatch): Promise<void> => {
      setData((d) => ({
        ...d,
        members: d.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
      }));
    },
    [setData],
  );

  /**
   * Contrato: `rpc/set_member_body`. El objetivo llega YA CALCULADO (ver
   * `domain/nutrition.ts`); aquí solo se guarda. `patch` es un objeto ya
   * filtrado por quien llama, así que fusionarlo tal cual sobre lo que
   * hubiera (o sobre los valores por defecto, si es la primera vez) basta
   * — igual que hace la RPC real con las claves presentes en el jsonb.
   */
  const setMyBody = useCallback(
    async (memberId: MemberId, patch: Partial<MemberBody>, kcalTarget: number | null): Promise<void> => {
      setData((d) => {
        const base: MemberBody = d.memberBody[memberId] ?? {
          sex: null,
          birthYear: null,
          heightCm: null,
          weightKg: null,
          activity: 'sedentary',
          goal: 'maintain',
        };
        const memberBody = { ...d.memberBody, [memberId]: { ...base, ...patch } };
        const members =
          kcalTarget != null
            ? d.members.map((m) => (m.id === memberId ? { ...m, kcalTarget } : m))
            : d.members;
        return { ...d, memberBody, members };
      });
    },
    [setData],
  );

  /**
   * Igual que la capa real (`useIntake.ts`): la RLS de la tabla real solo
   * deja leer la fila propia o la de un tutelado, así que aquí basta con
   * indexar `memberBody` por miembro — sin distinguir "propio" de
   * "tutelado", `data.memberBody` ya solo tiene lo que el hogar puede ver.
   */
  const bodyOf = useCallback(
    (memberId: MemberId): MemberBody | null => data.memberBody[memberId] ?? null,
    [data.memberBody],
  );

  /**
   * Contrato: en la capa real es un `upsert` directo sobre
   * `member_notify_pref` (sin RPC, ver `useNotifyPref.ts`). Solo se tocan
   * las claves presentes en el patch, fusionadas sobre `DEFAULT_NOTIFY_PREF`
   * si es la primera vez que se toca el ajuste — mismo criterio que
   * `setMemberSettings`/`setMyBody` de más arriba.
   */
  const setNotifyPref = useCallback(
    async (memberId: MemberId, patch: Partial<NotifyPref>): Promise<void> => {
      setData((d) => {
        const base = d.notifyPrefByMember[memberId] ?? DEFAULT_NOTIFY_PREF;
        return {
          ...d,
          notifyPrefByMember: { ...d.notifyPrefByMember, [memberId]: { ...base, ...patch } },
        };
      });
    },
    [setData],
  );

  /**
   * Contrato: en la capa real es un `upsert` directo sobre
   * `member_dashboard` (RLS `can_act_for`). Siempre del "yo" de la demo,
   * igual que `setRecipePref` — la demo no tiene sesión con la que elegir
   * otro miembro.
   */
  const setDashboardLayout = useCallback(
    async (layout: WidgetItem[]): Promise<void> => {
      setData((d) => ({
        ...d,
        dashboardByMember: { ...d.dashboardByMember, [DEMO_MY_MEMBER_ID]: layout },
      }));
    },
    [setData],
  );

  /**
   * Del hogar entero, agrupadas por receta — quién votó qué es visible a
   * propósito (ver `RecipePref` en `types.ts`). En demo "el hogar" es solo
   * el propio voto, pero el contrato ya es de lista para no divergir de la
   * capa real cuando hay tutelados con voto propio.
   */
  const recipePrefsByRecipe = useMemo(() => {
    const map = new Map<string, RecipePref[]>();
    for (const p of data.recipePrefs) {
      const list = map.get(p.recipeId) ?? [];
      list.push({ memberId: p.memberId, rating: p.rating });
      map.set(p.recipeId, list);
    }
    return map;
  }, [data.recipePrefs]);

  /**
   * Contrato: upsert/delete sobre `member_recipe_pref`, siempre del "yo" de
   * la demo. Pulsar el mismo botón otra vez quita el voto (se borra la
   * fila), tal y como pide la UI.
   */
  const setRecipePref = useCallback(
    async (recipeId: string, rating: RecipeRating): Promise<void> => {
      setData((d) => {
        const existing = d.recipePrefs.find(
          (p) => p.memberId === DEMO_MY_MEMBER_ID && p.recipeId === recipeId,
        );
        const withoutMine = d.recipePrefs.filter(
          (p) => !(p.memberId === DEMO_MY_MEMBER_ID && p.recipeId === recipeId),
        );
        if (existing && existing.rating === rating) {
          return { ...d, recipePrefs: withoutMine };
        }
        return {
          ...d,
          recipePrefs: [...withoutMine, { memberId: DEMO_MY_MEMBER_ID, recipeId, rating }],
        };
      });
    },
    [setData],
  );

  /**
   * Contrato: `update household set turns_enabled = ...` (columna con grant
   * de escritura propio, sin RPC — ver la migración de turnos). Cualquier
   * miembro puede llamarla, sin gate de admin: no es una acción de
   * pertenencia, ver el comentario de `HouseholdDetail.turnsEnabled` en
   * `types.ts`.
   */
  const setTurnsEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      setData((d) => ({ ...d, turnsEnabled: enabled }));
    },
    [setData],
  );

  /**
   * Contrato: `update plan_entry set cook_member_id = ...`. Puramente
   * informativo (turnos §10): no toca despensa ni calorías, solo dice quién
   * se apunta a cocinar esa comida.
   */
  const setCookMember = useCallback(
    async (planEntryId: string, memberId: MemberId | null): Promise<void> => {
      setData((d) => ({
        ...d,
        plan: d.plan.map((e) => (e.id === planEntryId ? { ...e, cookMemberId: memberId } : e)),
      }));
    },
    [setData],
  );

  /**
   * Contrato: upsert/delete sobre `shopping_turn` (clave `household_id,
   * week_start`, el hogar ya fijo en demo). `memberId: null` borra la fila
   * de esa semana, igual que hace un `delete` real.
   */
  const setShoppingTurn = useCallback(
    async (weekStart: string, memberId: MemberId | null): Promise<void> => {
      setData((d) => {
        const without = d.shoppingTurns.filter((s) => s.weekStart !== weekStart);
        return {
          ...d,
          shoppingTurns: memberId === null ? without : [...without, { weekStart, memberId }],
        };
      });
    },
    [setData],
  );

  /**
   * Puro sobre lo ya persistido: la aritmética (raciones, extras, totales)
   * sale de `domain/intake.ts`, igual que `useIntake.ts` en la capa real —
   * si las dos divergieran, la demo (pública, en rezet.jarsss8.es) enseñaría
   * un número que la app real no da.
   */
  const sharesOfMember = useCallback(
    (memberId: MemberId): Map<string, number> => {
      const map = new Map<string, number>();
      for (const s of data.intakeShares) {
        if (s.memberId === memberId) map.set(s.planEntryId, s.servings);
      }
      return map;
    },
    [data.intakeShares],
  );

  const intakeOfDayFor = useCallback(
    (memberId: MemberId, date: string): DayIntake => {
      const entries = entriesOfDay(date, data.plan);
      const shares = sharesOfMember(memberId);
      const extras: IntakeExtraLine[] = data.intakeExtras.filter(
        (e) => e.memberId === memberId && e.date === date,
      );
      return intakeOfDay({ entries, recipeById, shares, extras });
    },
    [data.plan, data.intakeExtras, recipeById, sharesOfMember],
  );

  const weekTotalsFor = useCallback(
    (memberId: MemberId, dates: string[]): DayTotal[] => {
      const shares = sharesOfMember(memberId);
      const entriesByDate = new Map(dates.map((d) => [d, entriesOfDay(d, data.plan)] as const));
      const extrasByDate = new Map(
        dates.map(
          (d) => [d, data.intakeExtras.filter((e) => e.memberId === memberId && e.date === d)] as const,
        ),
      );
      return weekTotals({ dates, entriesByDate, recipeById, shares, extrasByDate });
    },
    [data.plan, data.intakeExtras, recipeById, sharesOfMember],
  );

  /** Contrato: `rpc/set_member_body` visto desde `intake_share` — un upsert por (miembro, entrada de plan). */
  const setShare = useCallback(
    async (memberId: MemberId, planEntryId: string, servings: number): Promise<void> => {
      setData((d) => ({
        ...d,
        intakeShares: [
          ...d.intakeShares.filter((s) => !(s.memberId === memberId && s.planEntryId === planEntryId)),
          { memberId, planEntryId, servings },
        ],
      }));
    },
    [setData],
  );

  const addExtra = useCallback(
    async (input: ExtraInput): Promise<string> => {
      // Generado fuera del updater, mismo motivo que `pantryAdd`: bajo
      // <StrictMode> el updater se invoca dos veces en desarrollo, y un id
      // generado dentro daría dos valores distintos entre lo que esta
      // función devuelve y lo que React acaba guardando.
      const id = uid('extra');
      setData((d) => ({
        ...d,
        intakeExtras: [
          ...d.intakeExtras,
          {
            id,
            memberId: input.memberId,
            date: input.date,
            label: input.label,
            kcal: input.kcal,
            source: input.source,
            recipeId: input.recipeId ?? null,
          },
        ],
      }));
      return id;
    },
    [setData],
  );

  const removeExtra = useCallback(
    async (id: string): Promise<void> => {
      setData((d) => ({ ...d, intakeExtras: d.intakeExtras.filter((e) => e.id !== id) }));
    },
    [setData],
  );

  // Regla de negocio ("qué cuenta como repetido") movida a
  // `domain/intake.ts::frequentExtrasOf` (hallazgo de revisión: estaba
  // copiada palabra por palabra aquí y en `supabaseStore/useIntake.ts`).
  const frequentExtras = useCallback(
    (memberId: MemberId): FrequentExtra[] => frequentExtrasOf(memberId, data.intakeExtras),
    [data.intakeExtras],
  );

  const value = useMemo<Store>(
    () => ({
      ...data,
      pantry: pantryExposed,
      household: { ...DEMO_HOUSEHOLD, turnsEnabled: data.turnsEnabled },
      myMemberId: DEMO_MY_MEMBER_ID,
      createWardMember,
      deleteWardMember,
      setMemberSettings,
      recipeById,
      ingredientById,
      knownTags,
      stockOf,
      needOf,
      coverageOf,
      needsForWeek,
      shortagesFor,
      addPlanEntry,
      removePlanEntry,
      saveRecipe,
      deleteRecipe,
      pantryBump,
      pantryDelete,
      pantryAdd,
      toggleShoppingCheck,
      buyChecked,
      finishCook,
      leaveHousehold: demoHouseholdActionUnavailable,
      deleteHousehold: demoHouseholdActionUnavailable,
      promoteAdmin: demoMemberActionUnavailable,
      demoteAdmin: demoMemberActionUnavailable,
      removeMember: demoMemberActionUnavailable,
      setKomprappListToken: demoHouseholdActionUnavailable,
      deleteAccount: demoHouseholdActionUnavailable,
      setHouseholdSheetOpen: demoSetHouseholdSheetOpen,
      bodyOf,
      // La demo no hace ningún viaje de red: el estado ya está en memoria
      // desde el primer render, así que nunca hay una consulta "en curso".
      bodyLoading: false,
      setMyBody,
      intakeOfDayFor,
      setShare,
      addExtra,
      removeExtra,
      frequentExtras,
      weekTotalsFor,
      // Solo la fila del "yo" de la demo: un tutelado sin cuenta no recibe
      // avisos (no hay dónde enviárselos), igual que en la capa real.
      notifyPref: data.notifyPrefByMember[DEMO_MY_MEMBER_ID] ?? null,
      setNotifyPref,
      dashboardLayout: normalizeLayout(data.dashboardByMember[DEMO_MY_MEMBER_ID] ?? null, {
        turns: data.turnsEnabled,
      }),
      setDashboardLayout,
      recipePrefsByRecipe,
      setRecipePref,
      setTurnsEnabled,
      setCookMember,
      setShoppingTurn,
    }),
    [
      data,
      pantryExposed,
      recipeById,
      ingredientById,
      knownTags,
      stockOf,
      needOf,
      coverageOf,
      needsForWeek,
      shortagesFor,
      addPlanEntry,
      removePlanEntry,
      saveRecipe,
      deleteRecipe,
      pantryBump,
      pantryDelete,
      pantryAdd,
      toggleShoppingCheck,
      buyChecked,
      finishCook,
      createWardMember,
      deleteWardMember,
      setMemberSettings,
      bodyOf,
      setMyBody,
      intakeOfDayFor,
      setShare,
      addExtra,
      removeExtra,
      frequentExtras,
      weekTotalsFor,
      setNotifyPref,
      setDashboardLayout,
      recipePrefsByRecipe,
      setRecipePref,
      setTurnsEnabled,
      setCookMember,
      setShoppingTurn,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
