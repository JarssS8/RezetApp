import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { normalizeLayout, type WidgetAvailability, type WidgetItem } from '../../domain/dashboard';
import type { MemberId } from '../../types';

/**
 * El dashboard del miembro en sesión, capa real.
 *
 * La query devuelve el JSON crudo tal como está guardado; normalizar es
 * cosa de `domain/dashboard.ts` y se hace aquí en un `useMemo`, fuera de la
 * `queryFn`, para que TanStack pueda comparar estructuralmente lo que llega
 * del servidor. (Un `Map` o un objeto construido dentro de la `queryFn` no
 * se comparte estructuralmente y cambia de identidad en cada refetch, que
 * es el fallo que ya costó un formulario reseteándose en la fase 2.)
 */
export function useDashboard(
  householdId: string | null,
  myMemberId: MemberId | null,
  availability: WidgetAvailability,
) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: storeKeys.dashboard(householdId ?? 'none'),
    enabled: householdId !== null && myMemberId !== null,
    queryFn: async (): Promise<unknown> => {
      const { data, error } = await supabase
        .from('member_dashboard')
        .select('layout')
        .eq('member_id', myMemberId!)
        .maybeSingle();
      if (error) throw error;
      // Sin fila todavía: es el caso de todo el mundo el primer día, no un
      // error. `normalizeLayout(null)` da el layout por defecto.
      return data?.layout ?? null;
    },
  });

  const layout = useMemo(() => normalizeLayout(q.data ?? null, availability), [q.data, availability]);

  const save = useMutation({
    mutationFn: async (next: WidgetItem[]) => {
      if (!myMemberId) return;
      const { error } = await supabase.from('member_dashboard').upsert(
        {
          member_id: myMemberId,
          layout: { v: 1, items: next },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storeKeys.dashboard(householdId ?? 'none') });
    },
  });

  const setDashboardLayout = useCallback(
    async (next: WidgetItem[]) => {
      await save.mutateAsync(next);
    },
    [save],
  );

  return { dashboardLayout: layout, setDashboardLayout };
}
