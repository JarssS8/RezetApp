import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, project, rubberband, spring, velocityTracker } from './motion';

const CLOSE_THRESHOLD = 140;
const EXIT_Y = 620;
const REDUCED_FADE_MS = 120;

/**
 * Arrastre de hoja inferior con proyección de momento.
 *
 * Seguimiento 1:1 del dedo, resistencia progresiva (`rubberband`, README §9)
 * hacia arriba — cuanto más se tira, menos sigue —, y al soltar se
 * decide por dónde IBA el gesto, no por cuánto recorrió: una hoja lanzada hacia
 * abajo se cierra aunque se haya movido poco. Interrumpible en pleno vuelo.
 * `dismiss` cierra por el mismo camino (×, velo, Escape); con movimiento
 * reducido el muelle se sustituye por un fundido corto (README §6.8).
 */
export function useSheetDrag(onClose: () => void) {
  const [y, setY] = useState(0);
  const [fading, setFading] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const yRef = useRef(0);

  const set = useCallback((value: number) => {
    yRef.current = value;
    setY(value);
  }, []);

  useEffect(() => () => cancelRef.current?.(), []);

  const stopMotion = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setFading(false);
  }, []);

  const dismiss = useCallback(
    (velocity = 0) => {
      stopMotion();
      if (prefersReducedMotion()) {
        setFading(true);
        const timer = window.setTimeout(onClose, REDUCED_FADE_MS);
        cancelRef.current = () => window.clearTimeout(timer);
        return;
      }
      cancelRef.current = spring(yRef.current, EXIT_Y, velocity, set, () => {
        set(0);
        onClose();
      });
    },
    [onClose, set, stopMotion],
  );

  const settle = useCallback(
    (velocity: number) => {
      if (prefersReducedMotion()) set(0);
      else cancelRef.current = spring(yRef.current, 0, velocity, set);
    },
    [set],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      stopMotion();

      const startY = event.clientY - yRef.current;
      const track = velocityTracker();

      const move = (e: PointerEvent) => {
        const raw = e.clientY - startY;
        const dy = raw < 0 ? -rubberband(-raw, EXIT_Y) : raw;
        track.push(e.clientY);
        set(dy);
      };

      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      };

      const up = () => {
        stop();
        const velocity = track.value;
        if (yRef.current + project(velocity) > CLOSE_THRESHOLD) dismiss(velocity);
        else settle(velocity);
      };

      // El sistema se ha quedado el puntero (scroll, llamada): nunca cierra, vuelve a su sitio.
      const cancel = () => {
        stop();
        settle(0);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [dismiss, settle, set, stopMotion],
  );

  const scrimOpacity = fading ? 0 : Math.min(1, Math.max(0, 1 - y / EXIT_Y));

  return { y, fading, scrimOpacity, onPointerDown, dismiss };
}
