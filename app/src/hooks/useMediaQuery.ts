import { useEffect, useState } from 'react';

/**
 * Media query suscrita a `change`.
 *
 * Medir el ancho una sola vez al montar falla: el contenedor puede crecer
 * después sin disparar `resize`. Este hook se resuscribe y re-evalúa.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const useIsWide = () => useMediaQuery('(min-width: 900px)');

/** Dos columnas en el dashboard (§7.2). Por debajo, una sola. */
export const useIsMedium = () => useMediaQuery('(min-width: 600px)');
