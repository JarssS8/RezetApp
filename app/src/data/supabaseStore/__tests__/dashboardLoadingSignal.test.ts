import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { QueryObserver } from '@tanstack/query-core';
import { computeDashboardLoading } from '../useDashboard';
import { asMemberId } from '../../../types';

/**
 * Revisión final de rama, hallazgo Critical: `useDashboard.ts` deshabilitaba
 * su query mientras `myMemberId` (de `useMembers`, que también está
 * cargando en el arranque en frío) seguía en `null`. En TanStack Query v5
 * una query `enabled: false` tiene `status: 'pending'` y
 * `fetchStatus: 'idle'`, así que `isLoading` (`isPending && isFetching`) da
 * `false` — no porque ya se conozca el layout, sino porque la query nunca
 * llegó a arrancar. `DashboardEditSheet` interpretaba ese `false` como
 * "ya sé el layout real" (que en realidad seguía siendo el layout por
 * defecto), lo dejaba editable desde el primer render, y un solo toque
 * congelaba la resincronización (`dirty.current`) — al cerrar, esa copia
 * por defecto pisaba la personalización real ya guardada del miembro.
 *
 * Primero se deja constancia, con un `QueryObserver` real (no un doble), del
 * mecanismo exacto de TanStack del que depende el fallo: una query
 * habilitada con una promesa en vuelo SÍ da `isLoading: true` (control); la
 * misma query, deshabilitada, da `isLoading: false` aunque nada se sepa
 * todavía (la trampa). La diferencia entre ambas es exclusivamente
 * `enabled`, nunca si el dato ya se conoce.
 *
 * Después se prueba `computeDashboardLoading` — la función que
 * `useDashboard.ts` usa en vez de `q.isLoading` a secas — para fijar el
 * arreglo: mientras `myMemberId` sigue sin conocerse pero hay hogar, debe
 * seguir señalando "cargando" aunque la query de abajo esté deshabilitada.
 */
describe('señal de carga del dashboard — el hallazgo Critical de la revisión final', () => {
  it('control: query HABILITADA con una promesa en vuelo → isLoading es true', async () => {
    const client = new QueryClient();
    let resolveFetch: (() => void) | undefined;
    const observer = new QueryObserver(client, {
      queryKey: ['dashboard-loading-control'],
      enabled: true,
      queryFn: () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve(null);
        }),
    });

    // `subscribe` es lo que monta el hook (`useBaseQuery`) bajo el capó, y
    // dispara el fetch inicial si la query está habilitada — `fetch()` en sí
    // es un método `protected`, no parte del API público del observador.
    const unsubscribe = observer.subscribe(() => {});
    await Promise.resolve();

    expect(observer.getCurrentResult().isLoading).toBe(true);

    resolveFetch?.();
    unsubscribe();
    observer.destroy();
  });

  it('la trampa: la MISMA query, pero DESHABILITADA (como cuando myMemberId es null), da isLoading false sin saber nada todavía', () => {
    const client = new QueryClient();
    const observer = new QueryObserver(client, {
      queryKey: ['dashboard-loading-trap'],
      enabled: false,
      queryFn: () => new Promise(() => {}),
    });

    const result = observer.getCurrentResult();

    // Esto es justo el fallo: nunca se ha sabido nada del layout real, y
    // sin embargo `isLoading` ya dice `false`.
    expect(result.isLoading).toBe(false);
    expect(result.fetchStatus).toBe('idle');
    expect(result.status).toBe('pending');

    observer.destroy();
  });

  const MEMBER = asMemberId('m1');

  it('computeDashboardLoading: myMemberId aún null pero hay hogar → sigue "cargando" aunque la query de abajo esté deshabilitada (isLoading=false)', () => {
    // Este es el caso exacto del arranque en frío: `useMembers` todavía no
    // ha resuelto, así que `myMemberId` es `null` y la query de
    // `useDashboard` está deshabilitada (isLoading false, como el test de
    // arriba). Sin el arreglo, esto se traducía en "ya sé el layout real".
    expect(computeDashboardLoading(null, 'household-1', false)).toBe(true);
  });

  it('computeDashboardLoading: sin hogar, nada que cargar', () => {
    expect(computeDashboardLoading(null, null, false)).toBe(false);
  });

  it('computeDashboardLoading: con myMemberId ya conocido, manda la señal real de la query', () => {
    expect(computeDashboardLoading(MEMBER, 'household-1', true)).toBe(true);
    expect(computeDashboardLoading(MEMBER, 'household-1', false)).toBe(false);
  });
});
