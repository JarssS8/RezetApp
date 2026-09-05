import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { haptics } from '../motion/motion';
import type { CookSession, CookTimer, Recipe } from '../types';

/**
 * Estado del modo cocinar.
 *
 * Los temporizadores se guardan como instante de fin absoluto (`endsAt`), no
 * como segundos restantes: así siguen siendo correctos si la pantalla se apaga,
 * la pestaña se duerme o la app se recarga. `endsAt === null` = pausado.
 *
 * Navegar entre pasos NO crea, NO reinicia y NO detiene ningún temporizador.
 */

export function remainingOf(timer: CookTimer, now: number): number {
  if (timer.endsAt == null) return timer.remainingSeconds;
  return Math.max(0, Math.round((timer.endsAt - now) / 1000));
}

export const isRunning = (timer: CookTimer) => timer.endsAt != null;

function newSession(recipe: Recipe, servings: number, planEntryId: string | null): CookSession {
  const timers: Record<number, CookTimer> = {};
  recipe.steps.forEach((step, index) => {
    if (step.timerMinutes) {
      const total = step.timerMinutes * 60;
      timers[index] = { totalSeconds: total, remainingSeconds: total, endsAt: null };
    }
  });
  return {
    recipeId: recipe.id,
    servings,
    phase: 'mise',
    step: 0,
    checked: {},
    timers,
    planEntryId,
    showUpcoming: false,
    askExit: false,
  };
}

export type CookController = ReturnType<typeof useCookSession>;

export function useCookSession() {
  const [session, setSession] = usePersistentState<CookSession | null>('rezet.cook', null);
  const [now, setNow] = useState(() => Date.now());

  const anyRunning = useMemo(
    () => Object.values(session?.timers ?? {}).some(isRunning),
    [session],
  );

  // Un único reloj recorre todos los temporizadores; varios pueden correr a la vez.
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  // Al vencer: se detiene, se conserva en 0 y vibra una sola vez.
  useEffect(() => {
    if (!session) return;
    let fired = false;
    const timers: Record<number, CookTimer> = {};
    let changed = false;
    for (const [key, timer] of Object.entries(session.timers)) {
      const index = Number(key);
      if (isRunning(timer) && remainingOf(timer, now) === 0) {
        timers[index] = { ...timer, endsAt: null, remainingSeconds: 0 };
        changed = true;
        fired = true;
      } else {
        timers[index] = timer;
      }
    }
    if (changed) {
      setSession((s) => (s ? { ...s, timers } : s));
      if (fired) haptics.timerDone();
    }
  }, [now, session, setSession]);

  const patch = useCallback(
    (next: Partial<CookSession>) => setSession((s) => (s ? { ...s, ...next } : s)),
    [setSession],
  );

  const startCook = useCallback(
    (recipe: Recipe, servings: number, planEntryId: string | null) =>
      setSession(newSession(recipe, servings, planEntryId)),
    [setSession],
  );

  const endCook = useCallback(() => setSession(null), [setSession]);

  const goStep = useCallback(
    (index: number, stepCount: number) =>
      patch({ phase: 'steps', step: Math.max(0, Math.min(stepCount - 1, index)) }),
    [patch],
  );

  const toggleChecked = useCallback(
    (index: number) =>
      setSession((s) =>
        s ? { ...s, checked: { ...s.checked, [index]: !s.checked[index] } } : s,
      ),
    [setSession],
  );

  const setServings = useCallback(
    (servings: number) => patch({ servings: Math.max(1, Math.min(24, servings)) }),
    [patch],
  );

  const toggleTimer = useCallback(
    (index: number) =>
      setSession((s) => {
        if (!s) return s;
        const timer = s.timers[index];
        if (!timer) return s;
        const next: CookTimer = isRunning(timer)
          ? { ...timer, remainingSeconds: remainingOf(timer, Date.now()), endsAt: null }
          : {
              ...timer,
              // Arrancar un temporizador vencido lo reinicia.
              remainingSeconds: timer.remainingSeconds || timer.totalSeconds,
              endsAt: Date.now() + (timer.remainingSeconds || timer.totalSeconds) * 1000,
            };
        return { ...s, timers: { ...s.timers, [index]: next } };
      }),
    [setSession],
  );

  const resetTimer = useCallback(
    (index: number) =>
      setSession((s) => {
        if (!s) return s;
        const timer = s.timers[index];
        if (!timer) return s;
        return {
          ...s,
          timers: {
            ...s.timers,
            [index]: { ...timer, remainingSeconds: timer.totalSeconds, endsAt: null },
          },
        };
      }),
    [setSession],
  );

  return {
    session,
    now,
    startCook,
    endCook,
    patch,
    goStep,
    toggleChecked,
    setServings,
    toggleTimer,
    resetTimer,
  };
}
