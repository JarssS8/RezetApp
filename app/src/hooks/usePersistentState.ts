import { useCallback, useEffect, useRef, useState } from 'react';

/** Estado espejado en localStorage. Tolera JSON corrupto y almacenamiento vetado. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw) as unknown;
      const mergeable =
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        initial !== null &&
        typeof initial === 'object' &&
        !Array.isArray(initial);
      return mergeable ? ({ ...(initial as object), ...(parsed as object) } as T) : (parsed as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* almacenamiento no disponible: seguimos en memoria */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

/** Reloj de 1 s que sólo corre cuando hace falta (temporizadores activos). */
export function useTicker(active: boolean): number {
  const [, force] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    ref.current = window.setInterval(() => force((n) => n + 1), 1000);
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [active]);

  return Date.now();
}

/** Toast efímero. */
export function useToast(ms = 2200) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}
