import type { MemberId } from '../../types';

// Vive en su propio fichero, y no dentro de `useDashboard.ts`, porque ese
// importa `supabaseClient.ts`, que LANZA al cargarse si faltan
// `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. El job de tests de CI no
// tiene esas variables, así que un test de esta función pura tumbaba el
// pipeline entero antes de desplegar nada. Una función sin efectos no debe
// obligar a mockear un cliente de red para poder probarse — mismo motivo por
// el que `send-timer-notifications` tiene su `quiet.ts` aparte del manejador.

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
 * propósito). Una vez se conoce `myMemberId`, la señal combina
 * `q.isLoading` con `q.isError`.
 *
 * Ese `isError` es la segunda ronda de revisión final, hallazgo Important:
 * si el `select` de `member_dashboard` falla (red intermitente, 5xx —
 * agotados los reintentos por defecto de TanStack), antes esto devolvía
 * `false` sin más: `q.isLoading` ya es `false` para una query en estado de
 * error (no está ni pendiente ni recargando), así que `DashboardEditSheet`
 * abría habilitada sobre `normalizeLayout(undefined ?? null, …)` — el
 * layout por defecto — y un guardado posterior (una petición DISTINTA, el
 * `upsert`, que puede ir bien aunque el `select` fallara) pisaba la
 * personalización real. Es el mismo daño que el hallazgo Critical, por
 * otra puerta: "no sé leerlo" y "no lo ha tocado nadie todavía" no son el
 * mismo caso, y solo el primero debe seguir bloqueando la edición. Decisión
 * explícita: mientras el error persista, la hoja se queda deshabilitada —
 * una hoja que no puede leer tu personalización no puede tener permiso
 * para sobrescribirla — y eso es intencional, no un estado a mitigar con
 * un layout "vacío pero editable".
 *
 * Extraída y exportada (como `fetchDashboardRaw` más arriba) para poder
 * fijarla con un test sin montar React — ver
 * `__tests__/dashboardLoadingSignal.test.ts`.
 */
export function computeDashboardLoading(
  myMemberId: MemberId | null,
  householdId: string | null,
  queryIsLoading: boolean,
  queryIsError: boolean,
): boolean {
  if (myMemberId === null) return householdId !== null;
  return queryIsLoading || queryIsError;
}
