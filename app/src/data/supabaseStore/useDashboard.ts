import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { normalizeLayout, type WidgetAvailability, type WidgetItem } from '../../domain/dashboard';
import type { MemberId } from '../../types';

/**
 * Lee la fila cruda de `member_dashboard`, sin normalizar. Extraída de la
 * `queryFn` (y exportada) para poder probar la composición sin montar React
 * — este repo no tiene Testing Library (ver `CLAUDE.md`, "Known gaps") — con
 * `fetchQuery` de un `QueryClient` real, igual que
 * `useDashboardComposition.test.ts` hace con esta misma función.
 *
 * Sin fila todavía (todo el mundo el primer día) devuelve `null`, no lanza:
 * es el caso normal, no un error. Normalizar ese `null` (o cualquier otro
 * valor) es cosa de quien llama (`domain/dashboard.ts::normalizeLayout`) —
 * nunca de aquí. Ver el porqué en el comentario de `useDashboard` más abajo.
 */
export async function fetchDashboardRaw(myMemberId: MemberId): Promise<unknown> {
  const { data, error } = await supabase
    .from('member_dashboard')
    .select('layout')
    .eq('member_id', myMemberId)
    .maybeSingle();
  if (error) throw error;
  return data?.layout ?? null;
}

/**
 * Combina el estado real de la query con si `myMemberId` ya se conoce.
 *
 * Ronda de arreglo final, hallazgo Critical: la query está `enabled` solo
 * cuando `myMemberId !== null` (viene de `useMembers`, que también está
 * cargando en el arranque en frío). Mientras tanto, en TanStack Query v5
 * una query deshabilitada tiene `status: 'pending'` y `fetchStatus: 'idle'`,
 * así que `q.isLoading` (`isPending && isFetching`) da `false` — no porque
 * ya se sepa el layout, sino porque la query ni siquiera ha arrancado. Sin
 * este cálculo aparte, `DashboardEditSheet` cree que ya sabe el layout
 * (todavía el por defecto), un solo toque marca `dirty` y congela la
 * resincronización, y al cerrar se guarda esa copia por defecto encima de
 * la personalización real que el miembro ya tenía guardada.
 *
 * Mientras `myMemberId` sigue sin resolverse, "cargando" es `true` si hay
 * hogar (se espera myMemberId tarde o temprano) y `false` si no lo hay
 * (nada que cargar — mismo caso que hoy deja `enabled` en `false` a
 * propósito). Una vez se conoce `myMemberId`, la señal real es la de
 * TanStack sin más: `q.isLoading` ya refleja el primer fetch de la query,
 * ahora sí habilitada.
 *
 * Extraída y exportada (como `fetchDashboardRaw` más arriba) para poder
 * fijarla con un test sin montar React — ver
 * `__tests__/dashboardLoadingSignal.test.ts`.
 */
export function computeDashboardLoading(
  myMemberId: MemberId | null,
  householdId: string | null,
  queryIsLoading: boolean,
): boolean {
  if (myMemberId === null) return householdId !== null;
  return queryIsLoading;
}

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
    queryFn: (): Promise<unknown> => fetchDashboardRaw(myMemberId!),
  });

  const layout = useMemo(() => normalizeLayout(q.data ?? null, availability), [q.data, availability]);

  const save = useMutation({
    mutationFn: async (next: WidgetItem[]) => {
      if (!myMemberId) return;
      const { error } = await supabase.from('member_dashboard').upsert(
        {
          member_id: myMemberId,
          layout: { v: 1, items: next },
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

  // Solo la primera carga, no cada refetch en segundo plano — mismo
  // contrato que `bodyLoading` (`useIntake.ts`). Antes de que resuelva,
  // `layout` de arriba YA es el layout por defecto normalizado; sin esta
  // señal, quien edite y guarde de vuelta (`DashboardEditSheet`) no puede
  // distinguir "todavía no sé" de "este miembro no tiene fila". No es
  // `q.isLoading` a secas: ver `computeDashboardLoading` más arriba.
  const dashboardLayoutLoading = computeDashboardLoading(myMemberId, householdId, q.isLoading);

  return { dashboardLayout: layout, dashboardLayoutLoading, setDashboardLayout };
}
