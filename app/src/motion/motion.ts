/**
 * Física de interacción. Sin dependencias.
 * Constantes de "Designing Fluid Interfaces" (WWDC 2018): no las cambies, están
 * ajustadas para que nada rebote donde no debe.
 */

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
}

/**
 * Muelle críticamente amortiguado, integrado por frame (no duración fija).
 * Anima SIEMPRE desde el valor actual en pantalla y con la velocidad de salida
 * del gesto, para que no haya salto al interrumpir. Devuelve la cancelación.
 */
export function spring(
  from: number,
  to: number,
  velocity: number,
  onUpdate: (value: number) => void,
  onDone?: () => void,
  options: SpringOptions = {},
): () => void {
  const k = options.stiffness ?? 190;
  const c = options.damping ?? 27;
  let x = from;
  let v = velocity || 0;
  let last = performance.now();
  let raf = 0;

  const step = (now: number) => {
    // Techo de 32 ms: evita saltos al volver de una pestaña dormida.
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    if (Math.abs(x - to) < 0.6 && Math.abs(v) < 14) {
      onUpdate(to);
      onDone?.();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Proyección de momento: dónde acabaría el gesto si lo dejaras decelerar.
 * Es la fórmula exponencial de iOS, no v²/(2a).
 */
export function project(velocity: number, deceleration = 0.998): number {
  return (velocity / 1000) * (deceleration / (1 - deceleration));
}

/** Resistencia progresiva al pasar de un límite. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Rastreador de velocidad en px/s. El dt mínimo de 8 ms evita que el ruido del
 * puntero produzca velocidades absurdas.
 */
export function velocityTracker() {
  let last: number | null = null;
  let lastTime = 0;
  let value = 0;
  return {
    push(position: number) {
      const now = performance.now();
      if (last !== null) value = ((position - last) / Math.max(8, now - lastTime)) * 1000;
      last = position;
      lastTime = now;
      return value;
    },
    get value() {
      return value;
    },
  };
}

/** Escalas de presión del diseño. El feedback ocurre en pointer-down. */
export const PRESS = {
  large: 0.98,
  medium: 0.96,
  small: 0.92,
  card: 0.985,
} as const;

export const EASE = 'cubic-bezier(.2,.7,.2,1)';
export const EASE_SHEET = 'cubic-bezier(.2,.75,.2,1)';

export const haptics = {
  addToPlan() {
    navigator.vibrate?.(12);
  },
  timerDone() {
    navigator.vibrate?.([40, 60, 40]);
  },
  cookSaved() {
    navigator.vibrate?.([18, 40, 26]);
  },
};

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
