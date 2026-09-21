import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { asMemberId, type MemberId, type RecipePref, type RecipeRating } from '../../types';

/** Fila cruda de `member_recipe_pref`, tal como la devuelve Supabase. */
interface RecipePrefRow {
  member_id: string;
  recipe_id: string;
  rating: number;
}

/**
 * Valoraciones de recetas (`member_recipe_pref`), capa real. Se lee TODO el
 * hogar de una vez, no solo la fila propia: a diferencia de
 * `member_notify_pref`/`member_body` (privados), leer aquí es del hogar
 * entero — el agregado ("gusta a 3 de 4") y quién votó qué son visibles a
 * propósito, ver la migración `20260921100100_rezet_recipe_pref.sql` y el
 * tipo `RecipePref` en `types.ts`. Sin RPC: la tabla concede
 * INSERT/UPDATE/DELETE bajo RLS (`can_act_for`), igual que
 * `useNotifyPref.ts`.
 */
export function useRecipePrefs(householdId: string, myMemberId: MemberId | null) {
  const queryClient = useQueryClient();
  const key = useMemo(() => storeKeys.recipePrefs(householdId), [householdId]);

  const recipePrefsQ = useQuery({
    queryKey: key,
    queryFn: async (): Promise<RecipePrefRow[]> => {
      const { data, error } = await supabase.from('member_recipe_pref').select('member_id, recipe_id, rating');
      if (error) throw error;
      return (data ?? []) as RecipePrefRow[];
    },
  });

  /** Agrupado por receta: es lo que pide el contrato `Store.recipePrefsByRecipe`. */
  const recipePrefsByRecipe = useMemo(() => {
    const map = new Map<string, RecipePref[]>();
    for (const row of recipePrefsQ.data ?? []) {
      const list = map.get(row.recipe_id) ?? [];
      list.push({ memberId: asMemberId(row.member_id), rating: row.rating as RecipeRating });
      map.set(row.recipe_id, list);
    }
    return map;
  }, [recipePrefsQ.data]);

  const setRecipePrefMut = useMutation({
    mutationFn: async ({ recipeId, rating }: { recipeId: string; rating: RecipeRating }) => {
      if (myMemberId === null) return;
      const current = (recipePrefsQ.data ?? []).find(
        (r) => r.member_id === myMemberId && r.recipe_id === recipeId,
      );
      // Pulsar el mismo botón otra vez quita el voto: se borra la fila en
      // vez de dejar la tabla con una valoración que ya nadie sostiene.
      if (current && current.rating === rating) {
        const { error } = await supabase
          .from('member_recipe_pref')
          .delete()
          .eq('member_id', myMemberId)
          .eq('recipe_id', recipeId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('member_recipe_pref')
        .upsert(
          { member_id: myMemberId, recipe_id: recipeId, rating },
          { onConflict: 'member_id,recipe_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const setRecipePref = useCallback(
    (recipeId: string, rating: RecipeRating) => setRecipePrefMut.mutateAsync({ recipeId, rating }),
    [setRecipePrefMut],
  );

  return { recipePrefsByRecipe, setRecipePref };
}
