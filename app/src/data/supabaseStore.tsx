import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { createStoreDerivations } from '../domain/deriveStore';
import { todayKey, slotForNow, resolveExpiry } from '../domain/dates';
import { SENSITIVE_RE, defaultLocationFor, inferFoodGroup } from '../domain/recipeText';
import { usePrefs } from '../store/prefs';
import { StoreCtx, type RecipeDraft, type Store } from './storeContext';
import type {
  FoodGroup,
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
 * Capa de datos REAL: Supabase + TanStack Query, con tiempo real en pantry,
 * plan y compra. Implementa el mismo contrato `Store` que `store.tsx` (modo
 * demo) — las pantallas no distinguen cuál está montado.
 *
 * Alcance de tiempo real (deliberado, no es un olvido): `pantry_item`,
 * `plan_entry`, `shopping_check` y los datos propios de `recipe`/
 * `recipe_ingredient` se sincronizan solos entre sesiones del mismo hogar.
 * Un cambio de OTRO miembro en los pasos o etiquetas de una receta no llega
 * en vivo (solo al refrescar o al recibir foco la pestaña, que TanStack
 * Query ya hace por defecto) — es un recorte de alcance para esta primera
 * versión, no un bug.
 */

function mapIngredient(row: {
  id: string;
  name_es: string;
  name_en: string;
  food_group: FoodGroup;
  default_unit: Unit;
  is_sensitive: boolean;
}): Ingredient {
  return {
    id: row.id,
    name: { es: row.name_es, en: row.name_en },
    group: row.food_group,
    defaultUnit: row.default_unit,
    sensitive: row.is_sensitive,
  };
}

interface RecipeRow {
  id: string;
  name: string;
  description: string | null;
  base_servings: number;
  minutes: number;
  difficulty: Recipe['difficulty'];
  kcal_per_serving: number;
  cooked_count: number;
  photo_path: string | null;
  recipe_tag: Array<{ tag: { name: string } }>;
  recipe_ingredient: Array<{ id: string; ingredient_id: string; quantity: number; unit: Unit; position: number }>;
  recipe_step: Array<{
    id: string;
    position: number;
    text: string;
    timer_minutes: number | null;
    recipe_step_ingredient: Array<{ recipe_ingredient_id: string }>;
  }>;
}

function mapRecipe(row: RecipeRow): Recipe {
  const ingredients = [...row.recipe_ingredient].sort((a, b) => a.position - b.position);
  const riIdToIngredientId = new Map(ingredients.map((ri) => [ri.id, ri.ingredient_id]));
  const steps = [...row.recipe_step].sort((a, b) => a.position - b.position);

  return {
    id: row.id,
    name: { es: row.name, en: row.name },
    description: { es: row.description ?? '', en: row.description ?? '' },
    baseServings: row.base_servings,
    minutes: row.minutes,
    difficulty: row.difficulty,
    kcalPerServing: row.kcal_per_serving,
    tags: row.recipe_tag.map((t) => t.tag.name),
    cookedCount: row.cooked_count,
    ...(row.photo_path
      ? { photoUrl: supabase.storage.from('recipe-photos').getPublicUrl(row.photo_path).data.publicUrl }
      : {}),
    ingredients: ingredients.map((ri) => ({
      ingredientId: ri.ingredient_id,
      quantity: Number(ri.quantity),
      unit: ri.unit,
    })),
    steps: steps.map((s) => {
      const ingredientIds = s.recipe_step_ingredient
        .map((x) => riIdToIngredientId.get(x.recipe_ingredient_id))
        .filter((x): x is string => Boolean(x));
      return {
        text: { es: s.text, en: s.text },
        ...(s.timer_minutes ? { timerMinutes: s.timer_minutes } : {}),
        ...(ingredientIds.length ? { ingredientIds } : {}),
      };
    }),
  };
}

function mapPantryItem(row: {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: Unit;
  location: PantryLoc;
  expires_on: string | null;
}): PantryItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    quantity: Number(row.quantity),
    unit: row.unit,
    location: row.location,
    expiresInDays: resolveExpiry(row.expires_on),
  };
}

function mapPlanEntry(row: {
  id: string;
  on_date: string;
  slot: MealSlot;
  recipe_id: string;
  servings: number;
  cooked_at: string | null;
}): PlanEntry {
  return {
    id: row.id,
    date: row.on_date,
    slot: row.slot,
    recipeId: row.recipe_id,
    servings: row.servings,
    cooked: row.cooked_at != null,
  };
}

const RECIPE_SELECT = `
  id, name, description, base_servings, minutes, difficulty, kcal_per_serving, cooked_count, photo_path,
  recipe_tag ( tag ( name ) ),
  recipe_ingredient ( id, ingredient_id, quantity, unit, position ),
  recipe_step ( id, position, text, timer_minutes, recipe_step_ingredient ( recipe_ingredient_id ) )
`;

/** Escapes `%`, `_` and `\` so a literal search term never acts as an ILIKE wildcard (Postgres LIKE/ILIKE default ESCAPE is `\`). */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

export function SupabaseDataProvider({
  householdId,
  children,
}: {
  householdId: string;
  children: React.ReactNode;
}) {
  const { locale } = usePrefs();
  const queryClient = useQueryClient();

  const ingredientsKey = useMemo(() => ['ingredients', householdId] as const, [householdId]);
  const recipesKey = useMemo(() => ['recipes', householdId] as const, [householdId]);
  const pantryKey = useMemo(() => ['pantry', householdId] as const, [householdId]);
  const planKey = useMemo(() => ['plan', householdId] as const, [householdId]);
  const shoppingKey = useMemo(() => ['shopping', householdId] as const, [householdId]);
  const householdKey = useMemo(() => ['household', householdId] as const, [householdId]);
  const householdMembersKey = useMemo(() => ['householdMembers', householdId] as const, [householdId]);

  const ingredientsQ = useQuery({
    queryKey: ingredientsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingredient')
        .select('id, name_es, name_en, food_group, default_unit, is_sensitive')
        .or(`household_id.eq.${householdId},household_id.is.null`);
      if (error) throw error;
      return (data ?? []).map(mapIngredient);
    },
  });

  const recipesQ = useQuery({
    queryKey: recipesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe')
        .select(RECIPE_SELECT)
        .eq('household_id', householdId)
        .is('archived_at', null);
      if (error) throw error;
      return (data ?? []).map((r) => mapRecipe(r as unknown as RecipeRow));
    },
  });

  const pantryQ = useQuery({
    queryKey: pantryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pantry_item')
        .select('id, ingredient_id, quantity, unit, location, expires_on')
        .eq('household_id', householdId);
      if (error) throw error;
      return (data ?? []).map(mapPantryItem);
    },
  });

  const planQ = useQuery({
    queryKey: planKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_entry')
        .select('id, on_date, slot, recipe_id, servings, cooked_at')
        .eq('household_id', householdId);
      if (error) throw error;
      return (data ?? []).map(mapPlanEntry);
    },
  });

  const shoppingQ = useQuery({
    queryKey: shoppingKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_check')
        .select('item_key')
        .eq('household_id', householdId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.item_key as string, true])) as Record<
        string,
        boolean
      >;
    },
  });

  const householdQ = useQuery({
    queryKey: householdKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household')
        .select('kcal_target, name')
        .eq('id', householdId)
        .single();
      if (error) throw error;
      return {
        kcalTarget: data.kcal_target as number,
        name: data.name as string,
      };
    },
  });

  /**
   * Se abre/cierra desde `App.tsx` (vía `setHouseholdSheetOpen`) mientras la
   * hoja "Tu hogar" o el flujo de salir/eliminar que cuelga de ella están
   * abiertos. `householdMembersQ` de abajo solo se pide con esto en `true`:
   * casi ninguna sesión abre esa hoja, así que pedirla en cada login sería
   * un viaje de red de más para algo que casi nadie ve (hallazgo 8).
   */
  const [householdSheetOpen, setHouseholdSheetOpen] = useState(false);

  /**
   * Nombres del resto del hogar, para la hoja "Tu hogar". No entra en el
   * gate `ready`: solo hace falta cuando se abre esa hoja, y bloquear toda
   * la app por ella sería carísimo para algo tan secundario. La RLS de
   * `profile` ya permite leer las filas de otros miembros del propio hogar
   * (`profile_select`: `id = auth.uid() OR household_id = current_household()`),
   * así que no hace falta ninguna migración para esta consulta.
   */
  const householdMembersQ = useQuery({
    queryKey: householdMembersKey,
    enabled: householdSheetOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile')
        .select('id, display_name, is_admin')
        .eq('household_id', householdId);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        displayName: r.display_name as string,
        isAdmin: r.is_admin as boolean,
      }));
    },
  });

  // ── Tiempo real ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`household-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantry_item', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: pantryKey }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plan_entry', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: planKey }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_check', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: shoppingKey }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recipe', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: recipesKey }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredient' }, () =>
        queryClient.invalidateQueries({ queryKey: recipesKey }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [householdId, queryClient, pantryKey, planKey, shoppingKey, recipesKey]);

  const household = useMemo<HouseholdDetail | null>(() => {
    if (!householdQ.data) return null;
    return {
      id: householdId,
      name: householdQ.data.name,
      members: householdMembersQ.data ?? [],
      membersLoaded: householdMembersQ.data !== undefined,
    };
  }, [householdId, householdQ.data, householdMembersQ.data]);

  const recipeById = useMemo(
    () => new Map((recipesQ.data ?? []).map((r) => [r.id, r])),
    [recipesQ.data],
  );
  const ingredientById = useMemo(
    () => new Map((ingredientsQ.data ?? []).map((i) => [i.id, i])),
    [ingredientsQ.data],
  );
  const knownTags = useMemo(
    () => Array.from(new Set((recipesQ.data ?? []).flatMap((r) => r.tags))),
    [recipesQ.data],
  );

  const { stockOf, needOf, coverageOf, needsForWeek, shortagesFor } = useMemo(
    () =>
      createStoreDerivations({
        pantry: pantryQ.data ?? [],
        recipeById,
        ingredientById,
        plan: planQ.data ?? [],
        locale,
      }),
    [pantryQ.data, planQ.data, recipeById, ingredientById, locale],
  );

  // ── Mutaciones ──────────────────────────────────────────────────────

  const addPlanEntry = useCallback(
    (recipeId: string, date: string, slot: MealSlot, servings?: number) => {
      const recipe = recipeById.get(recipeId);
      const finalServings = servings ?? recipe?.baseServings ?? 2;
      const tempId = uid('pe');
      queryClient.setQueryData<PlanEntry[]>(planKey, (old = []) => [
        ...old,
        { id: tempId, date, slot, recipeId, servings: finalServings, cooked: false },
      ]);
      void supabase
        .from('plan_entry')
        .insert({
          household_id: householdId,
          on_date: date,
          slot,
          recipe_id: recipeId,
          servings: finalServings,
        })
        .then(({ error }) => {
          if (error) queryClient.setQueryData<PlanEntry[]>(planKey, (old = []) => old.filter((e) => e.id !== tempId));
          void queryClient.invalidateQueries({ queryKey: planKey });
        });
    },
    [recipeById, householdId, queryClient, planKey],
  );

  const removePlanEntry = useCallback(
    (id: string) => {
      const prev = queryClient.getQueryData<PlanEntry[]>(planKey);
      queryClient.setQueryData<PlanEntry[]>(planKey, (old = []) => old.filter((e) => e.id !== id));
      void supabase
        .from('plan_entry')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error && prev) queryClient.setQueryData(planKey, prev);
        });
    },
    [queryClient, planKey],
  );

  const saveRecipeMut = useMutation({
    mutationFn: async (draft: RecipeDraft) => {
      const ingredients = draft.ingredients.filter((ri) => ri.name.trim());
      const steps = draft.steps.filter((s) => s.text.trim());
      const payload = {
        id: draft.id ?? null,
        name: draft.title,
        description: draft.description,
        base_servings: draft.baseServings,
        minutes: parseInt(draft.minutes, 10) || 20,
        difficulty: draft.difficulty,
        kcal_per_serving: parseInt(draft.kcal, 10) || 450,
        tags: draft.tags,
        ingredients: ingredients.length
          ? ingredients.map((ri) => ({
              name: ri.name.trim(),
              quantity: parseFloat(ri.quantity.replace(',', '.')) || 1,
              unit: ri.unit,
              sensitive: SENSITIVE_RE.test(ri.name),
            }))
          : [{ name: 'Sin especificar', quantity: 1, unit: 'ud', sensitive: false }],
        steps: steps.length
          ? steps.map((s) => ({
              text: s.text.trim(),
              timer_minutes: parseInt(s.timerMinutes, 10) > 0 ? parseInt(s.timerMinutes, 10) : null,
            }))
          : [{ text: '—', timer_minutes: null }],
        photo_path: draft.photoPath ?? null,
      };
      const { data, error } = await supabase.rpc('save_recipe', { payload });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recipesKey });
      void queryClient.invalidateQueries({ queryKey: ingredientsKey });
    },
  });
  const saveRecipe = useCallback((draft: RecipeDraft) => saveRecipeMut.mutateAsync(draft), [saveRecipeMut]);

  const pantryBump = useCallback(
    (id: string, delta: number) => {
      const prev = queryClient.getQueryData<PantryItem[]>(pantryKey);
      const current = prev?.find((p) => p.id === id);
      const nextQuantity = Math.max(0, (current?.quantity ?? 0) + delta);
      queryClient.setQueryData<PantryItem[]>(pantryKey, (old = []) =>
        old.map((p) => (p.id === id ? { ...p, quantity: nextQuantity } : p)).filter((p) => p.quantity > 0),
      );
      const write =
        nextQuantity <= 0
          ? supabase.from('pantry_item').delete().eq('id', id)
          : supabase.from('pantry_item').update({ quantity: nextQuantity }).eq('id', id);
      void write.then(({ error }) => {
        if (error && prev) queryClient.setQueryData(pantryKey, prev);
      });
    },
    [queryClient, pantryKey],
  );

  const pantryDelete = useCallback(
    (id: string) => {
      const prev = queryClient.getQueryData<PantryItem[]>(pantryKey);
      queryClient.setQueryData<PantryItem[]>(pantryKey, (old = []) => old.filter((p) => p.id !== id));
      void supabase
        .from('pantry_item')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error && prev) queryClient.setQueryData(pantryKey, prev);
        });
    },
    [queryClient, pantryKey],
  );

  const resolveIngredientId = useCallback(
    async (name: string, unit: Unit): Promise<string> => {
      const pattern = escapeIlike(name);
      const { data: found } = await supabase
        .from('ingredient')
        .select('id')
        .or(`household_id.eq.${householdId},household_id.is.null`)
        .ilike('name_es', pattern)
        .limit(1)
        .maybeSingle();
      if (found) return found.id as string;

      const { data: created, error } = await supabase
        .from('ingredient')
        .insert({
          household_id: householdId,
          name_es: name,
          name_en: name,
          default_unit: unit,
          food_group: inferFoodGroup(name),
          is_sensitive: SENSITIVE_RE.test(name),
        })
        .select('id')
        .single();
      if (error) {
        // Race: another concurrent call resolved/created this same name first and won the
        // unique constraint. Re-run the SELECT instead of throwing — don't retry everything.
        if (error.code === '23505') {
          const { data: retryFound, error: retryError } = await supabase
            .from('ingredient')
            .select('id')
            .or(`household_id.eq.${householdId},household_id.is.null`)
            .ilike('name_es', pattern)
            .limit(1)
            .maybeSingle();
          if (retryError) throw retryError;
          if (retryFound) return retryFound.id as string;
        }
        throw error;
      }
      return created.id as string;
    },
    [householdId],
  );

  const pantryAdd = useCallback(
    async (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) => {
      const ingredientId = await resolveIngredientId(input.name, input.unit);
      const { data, error } = await supabase
        .rpc('pantry_add', {
          p_ingredient_id: ingredientId,
          p_quantity: input.quantity,
          p_unit: input.unit,
          p_location: input.location,
          p_expires_on: input.expiresOn ?? null,
        })
        .select('id, merged, added_quantity')
        .single();
      if (error) throw error;
      const id = data.id as string;
      const merged = data.merged as boolean;
      const addedQuantity = data.added_quantity as number;
      queryClient.setQueryData<PantryItem[]>(pantryKey, (old = []) =>
        merged
          ? old.map((p) => (p.id === id ? { ...p, quantity: p.quantity + addedQuantity } : p))
          : [
              ...old,
              {
                id,
                ingredientId,
                quantity: addedQuantity,
                unit: input.unit,
                location: input.location,
                expiresInDays: resolveExpiry(input.expiresOn ?? null),
              },
            ],
      );
      void queryClient.invalidateQueries({ queryKey: pantryKey });
      void queryClient.invalidateQueries({ queryKey: ingredientsKey });
      return { id, merged, addedQuantity };
    },
    [resolveIngredientId, queryClient, pantryKey, ingredientsKey],
  );

  const toggleShoppingCheck = useCallback(
    (key: string) => {
      const prev = queryClient.getQueryData<Record<string, boolean>>(shoppingKey);
      const willCheck = !prev?.[key];
      queryClient.setQueryData<Record<string, boolean>>(shoppingKey, (old = {}) => ({
        ...old,
        [key]: willCheck,
      }));
      const write = willCheck
        ? supabase.from('shopping_check').insert({ household_id: householdId, item_key: key })
        : supabase.from('shopping_check').delete().eq('household_id', householdId).eq('item_key', key);
      void write.then(({ error }) => {
        if (error && prev) queryClient.setQueryData(shoppingKey, prev);
      });
    },
    [queryClient, shoppingKey, householdId],
  );

  const buyChecked = useCallback(
    (needs: ShoppingNeed[]) => {
      const checked = queryClient.getQueryData<Record<string, boolean>>(shoppingKey) ?? {};
      const items = needs
        .filter((n) => checked[n.key])
        .map((n) => ({
          ingredient_id: n.ingredientId,
          quantity: n.quantity,
          unit: n.unit,
          location: defaultLocationFor(n.group),
        }));
      if (!items.length) return;
      void supabase.rpc('buy_checked', { p_items: items }).then(({ error }) => {
        if (!error) {
          void queryClient.invalidateQueries({ queryKey: pantryKey });
          void queryClient.invalidateQueries({ queryKey: shoppingKey });
        }
      });
    },
    [queryClient, shoppingKey, pantryKey],
  );

  const finishCookMut = useMutation({
    mutationFn: async (input: { recipeId: string; servings: number; planEntryId: string | null }) => {
      const { data, error } = await supabase.rpc('finish_cook', {
        p_recipe_id: input.recipeId,
        p_servings: input.servings,
        p_plan_entry_id: input.planEntryId,
        p_today: todayKey(),
        p_slot: slotForNow(),
      });
      if (error) throw error;
      return (data ?? []) as Shortage[];
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pantryKey });
      void queryClient.invalidateQueries({ queryKey: planKey });
      void queryClient.invalidateQueries({ queryKey: recipesKey });
    },
  });
  const finishCook = useCallback(
    (input: { recipeId: string; servings: number; planEntryId: string | null }) =>
      finishCookMut.mutateAsync(input),
    [finishCookMut],
  );

  /**
   * `leave_household()`/`delete_household()` (ver migración
   * `20260907145609_rezet_leave_delete_household.sql`) devuelven sus
   * rechazos como excepciones Postgres normales (`code = P0001`), que
   * supabase-js expone en `error.message` ya en español y listas para
   * mostrar tal cual — mismo camino que usa `auth.tsx` con `create_household`
   * / `redeem_invite`. No hace falta invalidar ninguna query al terminar:
   * el éxito borra la fila `profile` propia, y quien llama se encarga de
   * disparar `refreshProfile()` para que `App.tsx` enrute a
   * `needsHousehold` — este `SupabaseDataProvider` entero se desmonta con
   * ese cambio de estado.
   */
  const leaveHouseholdMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('leave_household');
      if (error) throw new Error(error.message);
    },
  });
  const leaveHousehold = useCallback(() => leaveHouseholdMut.mutateAsync(), [leaveHouseholdMut]);

  const deleteHouseholdMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_household');
      if (error) throw new Error(error.message);
    },
  });
  const deleteHousehold = useCallback(() => deleteHouseholdMut.mutateAsync(), [deleteHouseholdMut]);

  /**
   * `promote_admin(p_member_id)`: mismo camino de error P0001 -> `error.message`
   * ya en español. Invalida `householdMembersKey` al terminar para que la
   * hoja "Tu hogar" refleje la nueva insignia de administrador sin recargar.
   */
  const promoteAdminMut = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('promote_admin', { p_member_id: memberId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdMembersKey }),
  });
  const promoteAdmin = useCallback(
    (memberId: string) => promoteAdminMut.mutateAsync(memberId),
    [promoteAdminMut],
  );

  /**
   * `delete_account()`: borra la cuenta de Auth de verdad, no solo el
   * profile. Igual que `leaveHousehold`/`deleteHousehold`, no hace falta
   * invalidar nada aquí — quien llama hace el cierre de sesión real (ver
   * `auth.tsx::signOut`), que desmonta este proveedor entero.
   */
  const deleteAccountMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw new Error(error.message);
    },
  });
  const deleteAccount = useCallback(() => deleteAccountMut.mutateAsync(), [deleteAccountMut]);

  const ready =
    !ingredientsQ.isLoading &&
    !recipesQ.isLoading &&
    !pantryQ.isLoading &&
    !planQ.isLoading &&
    !shoppingQ.isLoading &&
    !householdQ.isLoading;

  const value = useMemo<Store>(
    () => ({
      ingredients: ingredientsQ.data ?? [],
      recipes: recipesQ.data ?? [],
      pantry: pantryQ.data ?? [],
      plan: planQ.data ?? [],
      shoppingChecked: shoppingQ.data ?? {},
      kcalTarget: householdQ.data?.kcalTarget ?? 2100,
      household,
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
      leaveHousehold,
      deleteHousehold,
      promoteAdmin,
      deleteAccount,
      setHouseholdSheetOpen,
    }),
    [
      ingredientsQ.data,
      recipesQ.data,
      pantryQ.data,
      planQ.data,
      shoppingQ.data,
      householdQ.data,
      household,
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
      leaveHousehold,
      deleteHousehold,
      promoteAdmin,
      deleteAccount,
    ],
  );

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
        …
      </div>
    );
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
