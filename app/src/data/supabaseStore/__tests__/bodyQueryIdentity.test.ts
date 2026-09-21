import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

/**
 * Hallazgo de la revisión final de `feat/nutricion-personal`: `bodyQ` en
 * `useIntake.ts` devolvía un `Map` desde su `queryFn`. TanStack Query solo
 * sabe aplicar "structural sharing" (conservar la MISMA referencia cuando el
 * contenido no ha cambiado) sobre objetos y arrays planos — nunca sobre un
 * `Map` — así que cada refetch (basta con `refetchOnWindowFocus`, o sea
 * cambiar de app y volver) producía una identidad nueva aunque nada hubiera
 * cambiado en el servidor. Esa identidad nueva cambiaba `bodyOf`, que
 * cambiaba `initialBody` en `MemberTargetSheet`, que disparaba su `useEffect`
 * de resincronía y reescribía en silencio lo que la persona llevaba escrito
 * a mano (incluido el objetivo).
 *
 * No hay Testing Library en este repo (solo tests de dominio/datos, sin
 * React), así que esto no monta `MemberTargetSheet` ni `useIntake`: ejercita
 * directamente el mecanismo de TanStack del que depende el arreglo (devolver
 * un array/objeto plano desde la `queryFn`, nunca un `Map`) para dejar
 * constancia de que un refetch sin cambios no crea una identidad nueva.
 */
describe('structural sharing de TanStack Query — Map vs array plano', () => {
  // Importante: se comprueba con `client.getQueryData(key)` — el estado
  // guardado en caché, que es lo que `useQuery().data` (y por tanto `bodyQ.data`
  // en la app real) observa. El valor que devuelve `fetchQuery()`/`query.fetch()`
  // es el dato crudo de la `queryFn`, ANTES de aplicar structural sharing —
  // compararlo directamente daría un falso negativo.
  it('un Map pierde identidad en cada refetch aunque el contenido no cambie', async () => {
    const client = new QueryClient();
    const queryFn = async () => new Map([['m1', { weightKg: 62 }]]);

    await client.fetchQuery({ queryKey: ['body-map-test'], queryFn, staleTime: 0 });
    const first = client.getQueryData(['body-map-test']);
    await client.fetchQuery({ queryKey: ['body-map-test'], queryFn, staleTime: 0 });
    const second = client.getQueryData(['body-map-test']);

    // Mismo contenido, pero un `Map` nuevo en cada respuesta: es justo el
    // fallo que rompía el formulario.
    expect(second).not.toBe(first);
  });

  it('un array plano conserva la referencia en un refetch que no trae cambios', async () => {
    interface Row {
      memberId: string;
      weightKg: number;
      sex: 'female';
    }
    const client = new QueryClient();
    let calls = 0;
    // Cada llamada construye objetos NUEVOS (como hace `mapBody`/`BodyRow`
    // en useIntake.ts), pero con el mismo contenido — lo que importa es que
    // TanStack los trate como iguales y reuse la referencia vieja.
    const queryFn = async (): Promise<Row[]> => {
      calls += 1;
      return [{ memberId: 'm1', weightKg: 62, sex: 'female' }];
    };

    await client.fetchQuery({ queryKey: ['body-array-test'], queryFn, staleTime: 0 });
    const first = client.getQueryData<Row[]>(['body-array-test']);
    await client.fetchQuery({ queryKey: ['body-array-test'], queryFn, staleTime: 0 });
    const second = client.getQueryData<Row[]>(['body-array-test']);

    expect(calls).toBe(2); // sí hubo un segundo refetch...
    expect(second).toBe(first); // ...pero la referencia del array se conserva
    expect(second?.[0]).toBe(first?.[0]); // incluso la fila individual, así un `useMemo`/`useEffect` con esta fila como dependencia no se dispara de más
  });
});
