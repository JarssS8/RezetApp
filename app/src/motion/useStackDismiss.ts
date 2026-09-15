import { useCallback, useState, type AnimationEvent, type CSSProperties } from 'react';
import { EASE } from './motion';

const ENTER = `pushin .3s ${EASE} both`;
// La salida refleja la curva de entrada y va algo más rápida, de vuelta hacia la derecha.
const EXIT = 'pushout .22s cubic-bezier(.8,0,.8,.3) both';

/**
 * Vista apilada que entra desde la derecha y se descarta hacia la derecha
 * (README §2). `onClose` se llama cuando termina la animación de salida.
 */
export function useStackDismiss(onClose: () => void) {
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => setLeaving(true), []);

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>) => {
      if (leaving && event.target === event.currentTarget && event.animationName === 'pushout') onClose();
    },
    [leaving, onClose],
  );

  const style: CSSProperties = {
    animation: leaving ? EXIT : ENTER,
    pointerEvents: leaving ? 'none' : undefined,
  };

  return { dismiss, onAnimationEnd, style };
}
