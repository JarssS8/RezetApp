import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { createStoreDerivations } from '../domain/deriveStore';
import { todayKey, slotForNow, resolveExpiry } from '../domain/dates';
import { SENSITIVE_RE, defaultLocationFor, inferFoodGroup } from '../domain/recipeText';
import { usePrefs } from '../store/prefs';
import { useAuth } from './auth';
import { StoreCtx, type RecipeDraft, type Store } from './storeContext';
import type {
  HouseholdDetail,
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

import {
  RECIPE_SELECT,
  escapeIlike,
  mapIngredient,
  mapPantryItem,
  mapPlanEntry,
  mapRecipe,
  type RecipeRow,
} from './supabaseStore/rows';
import { storeKeys } from './supabaseStore/keys';
import { useMembers } from './supabaseStore/useMembers';
import { useIntake } from './supabaseStore/useIntake';

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
  // `profile.id` es el `auth_user_id` con el que se enlaza la fila de `member`
  // propia; este proveedor siempre está montado dentro de `AuthProvider`.
  const { profile } = useAuth();
  const { members, myMemberId, createWardMember, deleteWardMember, setMemberSettings } = useMembers(
    householdId,
    profile?.id ?? null,
  );

  const ingredientsKey = useMemo(() => storeKeys.ingredients(householdId), [householdId]);
  const recipesKey = useMemo(() => storeKeys.recipes(householdId), [householdId]);
  const pantryKey = useMemo(() => storeKeys.pantry(householdId), [householdId]);
  const planKey = useMemo(() => storeKeys.plan(householdId), [householdId]);
  const shoppingKey = useMemo(() => storeKeys.shopping(householdId), [householdId]);
  const householdKey = useMemo(() => storeKeys.household(householdId), [householdId]);
  const householdMembersKey = useMemo(() => storeKeys.householdMembers(householdId), [householdId]);

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
        .select('kcal_target, name, komprapp_list_token')
        .eq('id', householdId)
        .single();
      if (error) throw error;
      return {
        kcalTarget: data.kcal_target as number,
        name: data.name as string,
        komprappListToken: data.komprapp_list_token as string | null,
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
        { event: 'INSERT', schema: 'public', table: 'pantry_item', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: pantryKey }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pantry_item', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: pantryKey }),
      )
      .on(
        // Los DELETE no se pueden filtrar salvo con `replica identity full`, que ninguna de estas
        // tablas tiene — por defecto el evento de borrado no lleva household_id (solo la clave
        // primaria). Se invalida sin filtrar y sin leer el payload: el refetch pasa por RLS.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pantry_item' },
        () => queryClient.invalidateQueries({ queryKey: pantryKey }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plan_entry', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: planKey }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plan_entry', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: planKey }),
      )
      .on(
        // Mismo motivo que pantry_item arriba.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'plan_entry' },
        () => queryClient.invalidateQueries({ queryKey: planKey }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_check', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: shoppingKey }),
      )
      .on(
        // Los DELETE no se pueden filtrar salvo con `replica identity full`, y
        // tras el cambio de clave primaria household_id ya no viaja en el evento.
        // Se invalida sin filtrar: el refetch pasa por RLS.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_check' },
        () => queryClient.invalidateQueries({ queryKey: shoppingKey }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recipe', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: recipesKey }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'recipe', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: recipesKey }),
      )
      .on(
        // Mismo motivo que pantry_item arriba.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'recipe' },
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
      komprappListToken: householdQ.data?.komprappListToken ?? null,
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

  const {
    bodyOf,
    bodyLoading,
    setMyBody,
    intakeOfDayFor,
    setShare,
    addExtra,
    removeExtra,
    frequentExtras,
    weekTotalsFor,
  } = useIntake(householdId, myMemberId, recipeById, planQ.data ?? []);

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
        source_idea_id: draft.sourceIdeaId ?? null,
        tags: draft.tags,
        ingredients: ingredients.length
          ? ingredients.map((ri) => ({
              name: ri.name.trim(),
              quantity: ri.toTaste ? null : parseFloat(ri.quantity.replace(',', '.')) || 1,
              unit: ri.toTaste ? null : ri.unit,
              to_taste: ri.toTaste,
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

  // Sin RPC: la política RLS de `recipe` ya deja borrar solo lo del propio
  // hogar, y cada tabla que cuelga de una receta (ingredientes, pasos,
  // etiquetas, entradas del plan, temporizadores, historial de cocinado)
  // tiene `on delete cascade` hacia recipe(id). El plan cacheado sí puede
  // quedarse con entradas de una receta que ya no existe, por eso se
  // invalida además de invalidar recetas.
  const deleteRecipe = useCallback(
    (id: string) => {
      const prev = queryClient.getQueryData<Recipe[]>(recipesKey);
      queryClient.setQueryData<Recipe[]>(recipesKey, (old = []) => old.filter((r) => r.id !== id));
      void (async () => {
        // El objeto `Recipe` solo trae `photoUrl` (la URL pública ya
        // derivada), no la ruta cruda del bucket, así que se lee de la fila
        // antes de borrarla — esto es solo una lectura, no hay nada que
        // deshacer si falla. El borrado de la fila va PRIMERO: si se borrara
        // antes el objeto de Storage y luego el borrado de la fila fallara,
        // el rollback dejaría la receta restaurada sin foto para siempre. El
        // borrado del objeto es best-effort y solo se intenta si la fila se
        // borró de verdad — un objeto huérfano en Storage es inofensivo, un
        // job diario limpia las fotos que ninguna receta referencia ya.
        let photoPath: string | null = null;
        try {
          const { data: photoRow } = await supabase
            .from('recipe')
            .select('photo_path')
            .eq('id', id)
            .maybeSingle();
          photoPath = (photoRow?.photo_path as string | null) ?? null;
        } catch {
          // Best-effort: ver comentario de arriba.
        }

        const { error } = await supabase.from('recipe').delete().eq('id', id);
        if (error) {
          if (prev) queryClient.setQueryData(recipesKey, prev);
          return;
        }

        if (photoPath) {
          try {
            await supabase.storage.from('recipe-photos').remove([photoPath]);
          } catch {
            // Best-effort: ver comentario de arriba.
          }
        }

        void queryClient.invalidateQueries({ queryKey: planKey });
      })();
    },
    [queryClient, recipesKey, planKey],
  );

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

  /** `demote_admin` / `remove_member`: mismo camino de error y de invalidación que `promote_admin`. */
  const demoteAdminMut = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('demote_admin', { p_member_id: memberId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdMembersKey }),
  });
  const demoteAdmin = useCallback(
    (memberId: string) => demoteAdminMut.mutateAsync(memberId),
    [demoteAdminMut],
  );
  const removeMemberMut = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('remove_member', { p_member_id: memberId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdMembersKey }),
  });
  const removeMember = useCallback(
    (memberId: string) => removeMemberMut.mutateAsync(memberId),
    [removeMemberMut],
  );

  /**
   * `set_komprapp_list_token(p_token)`: solo un ADMIN puede vincular o
   * desvincular la lista de komprapp del hogar. Un token vacío cuenta como
   * desvincular (`NULLIF(trim(...), '')` en la migración), así que aquí
   * `null` se manda como cadena vacía para cubrir ambos casos. Invalida
   * `householdKey` para que `household.komprappListToken` refleje el cambio
   * sin recargar.
   */
  const setKomprappListTokenMut = useMutation({
    mutationFn: async (token: string | null) => {
      const { error } = await supabase.rpc('set_komprapp_list_token', { p_token: token ?? '' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKey }),
  });
  const setKomprappListToken = useCallback(
    (token: string | null) => setKomprappListTokenMut.mutateAsync(token),
    [setKomprappListTokenMut],
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
      members,
      myMemberId,
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
      leaveHousehold,
      deleteHousehold,
      promoteAdmin,
      demoteAdmin,
      removeMember,
      setKomprappListToken,
      deleteAccount,
      setHouseholdSheetOpen,
      bodyOf,
      bodyLoading,
      setMyBody,
      intakeOfDayFor,
      setShare,
      addExtra,
      removeExtra,
      frequentExtras,
      weekTotalsFor,
    }),
    [
      ingredientsQ.data,
      recipesQ.data,
      pantryQ.data,
      planQ.data,
      shoppingQ.data,
      householdQ.data,
      household,
      members,
      myMemberId,
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
      leaveHousehold,
      deleteHousehold,
      promoteAdmin,
      demoteAdmin,
      removeMember,
      setKomprappListToken,
      deleteAccount,
      bodyOf,
      bodyLoading,
      setMyBody,
      intakeOfDayFor,
      setShare,
      addExtra,
      removeExtra,
      frequentExtras,
      weekTotalsFor,
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
