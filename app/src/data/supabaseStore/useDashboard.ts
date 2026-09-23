import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { normalizeLayout, type WidgetAvailability, type WidgetItem } from '../../domain/dashboard';
import type { MemberId } from '../../types';
import { computeDashboardLoading } from './dashboardLoading';

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
  // `q.isLoading` a secas — tampoco ignora `q.isError`: ver
  // `computeDashboardLoading` más arriba.
  const dashboardLayoutLoading = computeDashboardLoading(myMemberId, householdId, q.isLoading, q.isError);

  // Tercera ronda de revisión final: `dashboardLayoutLoading` ya cubre
  // "no toques nada todavía" para cargando Y para error (misma señal,
  // misma protección), pero no basta para que QUIEN LO MUESTRE explique
  // la diferencia — un lector de pantalla que solo tiene `aria-busy`
  // dice "ocupada" para un error que puede tardar en resolverse solo,
  // sin decir nunca lo que de verdad pasó. Aparte, para que
  // `DashboardEditSheet` pueda avisar "no se pudo leer tu
  // personalización" en vez de dejarlo atenuado sin explicación. Solo
  // cuenta como error una vez se conoce `myMemberId` — antes de eso
  // `q.isError` no significa nada (la query ni ha arrancado).
  const dashboardLayoutError = myMemberId !== null && q.isError;

  return { dashboardLayout: layout, dashboardLayoutLoading, dashboardLayoutError, setDashboardLayout };
}

// Re-exportada para quien ya la importaba desde aquí.
export { computeDashboardLoading };
