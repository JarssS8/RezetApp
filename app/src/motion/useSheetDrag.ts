import { useCallback, useRef, useState } from 'react';
import { project, spring, velocityTracker } from './motion';

const CLOSE_THRESHOLD = 140;
const EXIT_Y = 620;

/**
 * Arrastre de hoja inferior con proyección de momento.
 *
 * Seguimiento 1:1 del dedo, resistencia del 25% hacia arriba, y al soltar se
 * decide por dónde IBA el gesto, no por cuánto recorrió: una hoja lanzada hacia
 * abajo se cierra aunque se haya movido poco. Interrumpible en pleno vuelo.
 */
export function useSheetDrag(onClose: () => void) {
  const [y, setY] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);
  const yRef = useRef(0);

  const set = useCallback((value: number) => {
    yRef.current = value;
    setY(value);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      cancelRef.current?.();
      cancelRef.current = null;

      const startY = event.clientY - yRef.current;
      const track = velocityTracker();

      const move = (e: PointerEvent) => {
        let dy = e.clientY - startY;
        if (dy < 0) dy *= 0.25;
        track.push(e.clientY);
        set(dy);
      };

      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const current = yRef.current;
        const velocity = track.value;
        if (current + project(velocity) > CLOSE_THRESHOLD) {
          cancelRef.current = spring(current, EXIT_Y, velocity, set, () => {
            set(0);
            onClose();
          });
        } else {
          cancelRef.current = spring(current, 0, velocity, set);
        }
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onClose, set],
  );

  const reset = useCallback(() => set(0), [set]);

  return { y, onPointerDown, reset };
}
