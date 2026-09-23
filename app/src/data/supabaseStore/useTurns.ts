import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { asMemberId, type MemberId, type ShoppingTurn } from '../../types';

/** Fila cruda de `shopping_turn`, tal como la devuelve Supabase. */
interface ShoppingTurnRow {
  week_start: string;
  member_id: string;
}

/**
 * A quién le toca la compra de cada semana (`shopping_turn`), turnos §10 —
 * opcional (`household.turnsEnabled`) y puramente informativo. Igual que
 * `useRecipePrefs.ts`, la query devuelve un ARRAY plano, nunca un `Map`:
 * TanStack no le hace structural sharing a un mapa, así que cada refetch
 * cambiaría de identidad y dispararía en cascada cualquier efecto que
 * dependiera de él (el mismo fallo ya costó una ronda en una fase anterior
 * de este proyecto). `Store.shoppingTurns` expone ese array tal cual; quien
 * necesite indexar por semana construye su propio `Map` con `useMemo`.
 *
 * `enabled: turnsEnabled` — con los turnos apagados no se pide nada, ni
 * siquiera un viaje de red de algo que la interfaz no va a enseñar.
 */
export function useTurns(householdId: string, turnsEnabled: boolean) {
  const queryClient = useQueryClient();
  const key = useMemo(() => storeKeys.shoppingTurns(householdId), [householdId]);

  const shoppingTurnsQ = useQuery({
    queryKey: key,
    enabled: turnsEnabled,
    queryFn: async (): Promise<ShoppingTurn[]> => {
      const { data, error } = await supabase
        .from('shopping_turn')
        .select('week_start, member_id')
        .eq('household_id', householdId);
      if (error) throw error;
      return (data ?? []).map((row: ShoppingTurnRow) => ({
        weekStart: row.week_start,
        memberId: asMemberId(row.member_id),
      }));
    },
  });

  const setShoppingTurnMut = useMutation({
    mutationFn: async ({ weekStart, memberId }: { weekStart: string; memberId: MemberId | null }) => {
      if (memberId === null) {
        const { error } = await supabase
          .from('shopping_turn')
          .delete()
          .eq('household_id', householdId)
          .eq('week_start', weekStart);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('shopping_turn')
        .upsert(
          { household_id: householdId, week_start: weekStart, member_id: memberId },
          { onConflict: 'household_id,week_start' },
        );
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const setShoppingTurn = useCallback(
    (weekStart: string, memberId: MemberId | null) =>
      setShoppingTurnMut.mutateAsync({ weekStart, memberId }),
    [setShoppingTurnMut],
  );

  return { shoppingTurns: shoppingTurnsQ.data ?? [], setShoppingTurn };
}
