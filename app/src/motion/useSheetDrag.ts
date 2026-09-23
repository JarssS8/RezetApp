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
 *
 * `canClose` (revisión final de rama, hallazgo Important I2): opcional —
 * las 22 hojas que hoy pasan un `onClose` normal no lo usan y no cambian de
 * comportamiento. Cuando se da, `dismiss` lo consulta ANTES de tocar
 * ningún estado visual: nada de fundido ni de muelle de salida empieza
 * hasta saber si el cierre va a ocurrir de verdad. `onClose` sigue siendo
 * lo que ya era para el resto del repo — SIEMPRE desmonta, nunca puede
 * fallar — así que `DashboardEditSheet` (la única hoja cuyo cierre puede
 * fallar, por el guardado en red) es la única que pasa `canClose`; su
 * `onClose` sigue siendo el de verdad, el que le pasó su padre.
 *
 * Si `canClose` deniega el cierre (devuelve `false`, sea sync o vía
 * `Promise`), no hay nada que deshacer: como la animación nunca llegó a
 * arrancar, la hoja sigue exactamente como estaba — interactiva, opaca,
 * sin la capa `position: fixed` quedándose atenuada por encima de toda la
 * app (el fallo que `DashboardEditSheet` disparaba con
 * `prefers-reduced-motion` cuando el guardado fallaba). Si venía de un
 * arrastre soltado más allá del umbral, además se `settle()`-ea de vuelta
 * a `y: 0` — si no, la hoja se queda colgada en la posición arrastrada,
 * con el velo a media opacidad, sin fundido pero igual de inusable.
 *
 * `closingRef` (segunda ronda de revisión final): `dismiss` no se puede
 * reentrar mientras un cierre sigue en curso — ni desde otra vía (botón,
 * velo, Escape, otro arrastre) ni desde la misma. Antes, `dismiss` siempre
 * empezaba por `stopMotion()`, que cancela el muelle/temporizador de
 * salida SIN llamar a `onClose`: un segundo Escape mientras la animación
 * de salida seguía en vuelo (~300ms; 120ms con movimiento reducido) la
 * cancelaba a medias y volvía a consultar `canClose`, que en
 * `DashboardEditSheet` devolvía `false` porque su guarda local de
 * reentrada se había quedado en `true` — desde ahí ningún cierre volvía a
 * funcionar, con la capa `position: fixed; inset: 0; zIndex: 80` encima de
 * la app hasta recargar. La guarda va aquí, en el componente compartido,
 * no en cada hoja: es `useSheetDrag`/`Sheet` quien asume que `onClose`
 * siempre desmonta, así que es aquí donde hay que impedir un segundo
 * intento mientras el primero sigue abierto. Se libera de nuevo en cuanto
 * `canClose` deniega (para poder reintentar) o nunca, si el cierre llega a
 * completarse (la hoja se desmonta con `onClose`, así que ya no importa).
 */
export function useSheetDrag(onClose: () => void, canClose?: () => boolean | Promise<boolean>) {
  const [y, setY] = useState(0);
  const [fading, setFading] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const yRef = useRef(0);
  const closingRef = useRef(false);

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

  const settle = useCallback(
    (velocity: number) => {
      if (prefersReducedMotion()) set(0);
      else cancelRef.current = spring(yRef.current, 0, velocity, set);
    },
    [set],
  );

  // La animación de salida en sí — separada de `dismiss` para poder
  // retrasarla hasta que `canClose` (si lo hay) haya dado el visto bueno.
  const runCloseAnimation = useCallback(
    (velocity: number) => {
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
    [onClose, set],
  );

  const dismiss = useCallback(
    (velocity = 0) => {
      // Reentrada: un cierre ya está en curso (esperando `canClose`, o ya
      // animando la salida) — nada que hacer hasta que se resuelva.
      if (closingRef.current) return;
      closingRef.current = true;
      stopMotion();
      if (!canClose) {
        runCloseAnimation(velocity);
        return;
      }
      // No se toca `fading`/`y` mientras se espera la respuesta: si deniega,
      // no hay nada que revertir porque nada llegó a cambiar (salvo, si
      // venía de un arrastre, devolver `y` a 0 — ver `settle` más abajo).
      void Promise.resolve(canClose()).then((allowed) => {
        if (allowed) {
          runCloseAnimation(velocity);
          return;
        }
        closingRef.current = false;
        settle(velocity);
      });
    },
    [canClose, runCloseAnimation, settle, stopMotion],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Mismo motivo que la reentrada de `dismiss`: agarrar el asa mientras
      // un cierre ya está en curso podría cancelar (vía `stopMotion`, más
      // abajo) el muelle/temporizador de salida sin que `onClose` llegue a
      // llamarse, dejando `closingRef` atascado en `true` para siempre.
      if (closingRef.current) return;
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
