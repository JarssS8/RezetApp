import { useCallback, useEffect, useMemo } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { scaleQuantity } from '../domain/scaling';
import { addDays, dateKey, resolveExpiry, slotForNow, todayKey } from '../domain/dates';
import { SENSITIVE_RE, defaultLocationFor, inferFoodGroup } from '../domain/recipeText';
import { createStoreDerivations } from '../domain/deriveStore';
import { INGREDIENTS, KCAL_TARGET, PANTRY, PLAN, RECIPES } from './seed';
import { usePrefs } from '../store/prefs';
import { StoreCtx, type RecipeDraft, type Store } from './storeContext';
import type {
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
}

const INITIAL: Data = {
  ingredients: INGREDIENTS,
  recipes: RECIPES,
  pantry: toStoredPantry(PANTRY),
  plan: PLAN,
  shoppingChecked: {},
  kcalTarget: KCAL_TARGET,
};

export type { RecipeDraft, Coverage, Store } from './storeContext';
export { useData } from './storeContext';

const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

/**
 * El modo demo no tiene concepto real de hogar multi-usuario (no hay
 * sesión, no hay otros miembros). `household` se rellena con un valor
 * mínimo de un solo miembro solo para satisfacer el contrato `Store` —
 * nunca se muestra: la fila "Tu hogar" de Ajustes no se renderiza en demo
 * (mismo patrón que `onInvite={demo ? undefined : ...}` en `App.tsx`).
 * `leaveHousehold`/`deleteHousehold` son alcanzables solo si algo llama a
 * estas funciones sin pasar por esa UI, así que rechazan con un mensaje
 * claro en vez de fingir que hacen algo.
 */
const DEMO_HOUSEHOLD: HouseholdDetail = {
  id: 'demo',
  name: 'Demo',
  ownerId: 'demo-user',
  members: [{ id: 'demo-user', displayName: 'Tú' }],
  membersLoaded: true,
};

async function demoHouseholdActionUnavailable(): Promise<never> {
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
              quantity: parseFloat(ri.quantity.replace(',', '.')) || 1,
              unit: ri.unit,
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
   * Contrato: `rpc/finish_cook`. En una sola operación: resta de la despensa lo
   * escalado, incrementa el contador, marca la entrada de plan (o crea una de
   * hoy) y devuelve lo que faltaba.
   */
  const finishCook = useCallback(
    async (input: { recipeId: string; servings: number; planEntryId: string | null }): Promise<Shortage[]> => {
      const recipe = recipeById.get(input.recipeId);
      if (!recipe) return [];
      const shortages = shortagesFor(recipe, input.servings);

      setData((d) => {
        const pantry = d.pantry.map((p) => ({ ...p }));
        recipe.ingredients.forEach((ri) => {
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
        if (existing) {
          // Idempotencia: si ya estaba cocinada, no se vuelve a restar.
          plan = d.plan.map((e) =>
            e.id === existing.id ? { ...e, cooked: true, servings: input.servings } : e,
          );
        } else {
          plan = [
            ...d.plan,
            {
              id: uid('pe'),
              date: todayKey(),
              slot: slotForNow(),
              recipeId: recipe.id,
              servings: input.servings,
              cooked: true,
            },
          ];
        }

        return { ...d, pantry: pantry.filter((p) => p.quantity > 0), recipes, plan };
      });

      return shortages;
    },
    [recipeById, shortagesFor, setData],
  );

  const value = useMemo<Store>(
    () => ({
      ...data,
      pantry: pantryExposed,
      household: DEMO_HOUSEHOLD,
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
      pantryBump,
      pantryDelete,
      pantryAdd,
      toggleShoppingCheck,
      buyChecked,
      finishCook,
      leaveHousehold: demoHouseholdActionUnavailable,
      deleteHousehold: demoHouseholdActionUnavailable,
      setHouseholdSheetOpen: demoSetHouseholdSheetOpen,
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
      pantryBump,
      pantryDelete,
      pantryAdd,
      toggleShoppingCheck,
      buyChecked,
      finishCook,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
