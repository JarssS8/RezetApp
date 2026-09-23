import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { normalizeLayout } from '../../../domain/dashboard';
import { asMemberId } from '../../../types';

/**
 * Ronda de arreglo 1 de la Tarea 3 (revisión): el hallazgo Important decía
 * que `useDashboard.ts` no tenía test propio para su composición —
 * `normalizeLayout` (Tarea 1) y el RLS de `member_dashboard` (Tarea 2) ya
 * están probados, pero nada cubría lo que hace `useDashboard.ts` ENTRE
 * ambos: (1) traducir "sin fila" (`maybeSingle()` → `data: null`) al `null`
 * que espera `normalizeLayout`, y (2) devolver el JSON crudo desde la
 * `queryFn` — nunca ya normalizado — para que TanStack pueda compartir
 * identidad entre refetches sin cambios, el mismo mecanismo que en la fase
 * 2 reseteaba un formulario en `MemberTargetSheet` (ver
 * `bodyQueryIdentity.test.ts`, el precedente que sigue este fichero).
 *
 * No hay Testing Library en este repo (ver `CLAUDE.md`, "Known gaps"), así
 * que no se monta `useDashboard` como hook de React. En su lugar se prueba
 * `fetchDashboardRaw` — la función que `useDashboard.ts` extrae de su
 * `queryFn` justo para esto — con `supabase` sustituido por un doble de
 * prueba, nunca contra producción.
 */

const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'member_dashboard') throw new Error(`tabla inesperada: ${table}`);
      return {
        select: (cols: string) => {
          if (cols !== 'layout') throw new Error(`columnas inesperadas: ${cols}`);
          return {
            eq: (_col: string, _val: string) => ({
              maybeSingle: () => maybeSingleMock(),
            }),
          };
        },
      };
    },
  },
}));

// Import DESPUÉS del mock: es la misma función que usa el `queryFn` real de
// `useDashboard.ts`, no una reimplementación de la prueba.
const { fetchDashboardRaw } = await import('../useDashboard');

const MEMBER = asMemberId('m1');

describe('useDashboard — composición de fetchDashboardRaw (capa real)', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
  });

  it('sin fila (el primer día de todo el mundo) se traduce en null, no en error', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const raw = await fetchDashboardRaw(MEMBER);

    expect(raw).toBeNull();
    // Y ese `null` es justo lo que `normalizeLayout` espera para dar el
    // layout por defecto, sin lanzar — la parte que sí prueba la Tarea 1,
    // encadenada aquí para dejar constancia de la composición completa.
    const layout = normalizeLayout(raw, { turns: false });
    expect(layout.length).toBeGreaterThan(0);
    expect(layout.every((w) => w.on)).toBe(true);
    expect(layout.some((w) => w.id === 'whose_turn')).toBe(false);
  });

  it('la fila vuelve TAL CUAL — sin pasar por normalizeLayout dentro del fetch', async () => {
    // Deliberadamente no-normalizado: un id que ya no existe en el catálogo
    // y sin la clave `on`. Si alguien mete `normalizeLayout(...)` dentro de
    // `fetchDashboardRaw` (o de la `queryFn` que la llama), este payload
    // saldría filtrado/completado y el `toEqual` de abajo fallaría.
    const raw = { v: 1, items: [{ id: 'kcal_ring', w: 'full' }, { id: 'widget_que_ya_no_existe', w: 'half' }] };
    maybeSingleMock.mockResolvedValueOnce({ data: { layout: raw }, error: null });

    const result = await fetchDashboardRaw(MEMBER);

    expect(result).toEqual(raw);
  });

  it('un refetch con la misma fila conserva la referencia (structural sharing) — el mecanismo de la fase 2', async () => {
    const client = new QueryClient();
    const key = ['dashboard-composition-test'];
    const queryFn = () => fetchDashboardRaw(MEMBER);

    // Misma fila (contenido igual) en las dos llamadas, pero servida como un
    // objeto NUEVO cada vez desde el doble de `supabase` — igual que hace
    // PostgREST realmente en cada respuesta.
    maybeSingleMock.mockResolvedValueOnce({
      data: { layout: { v: 1, items: [{ id: 'kcal_ring', w: 'full', on: true }] } },
      error: null,
    });
    await client.fetchQuery({ queryKey: key, queryFn, staleTime: 0 });
    const first = client.getQueryData(key);

    maybeSingleMock.mockResolvedValueOnce({
      data: { layout: { v: 1, items: [{ id: 'kcal_ring', w: 'full', on: true }] } },
      error: null,
    });
    await client.fetchQuery({ queryKey: key, queryFn, staleTime: 0 });
    const second = client.getQueryData(key);

    // El doble sí respondió dos veces...
    expect(maybeSingleMock).toHaveBeenCalledTimes(2);
    // ...pero TanStack conserva la misma referencia porque el JSON crudo es
    // un objeto plano comparable estructuralmente (nunca un `Map`, nunca ya
    // normalizado con identidades nuevas en cada paso).
    expect(second).toBe(first);
  });
});
