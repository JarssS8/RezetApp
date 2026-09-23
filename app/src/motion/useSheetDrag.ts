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
 * `Promise`, o si la propia promesa rechaza), no hay nada que deshacer: la
 * hoja sigue — o vuelve a estar — exactamente como antes de tocar cerrar:
 * interactiva, opaca, sin la capa `position: fixed` quedándose atenuada
 * por encima de toda la app (el fallo que `DashboardEditSheet` disparaba
 * con `prefers-reduced-motion` cuando el guardado fallaba). Mientras se
 * espera la respuesta — no solo si al final deniega — la hoja ya vuelve a
 * `y: 0` con `settle()`: sin esto, un arrastre soltado más allá del
 * umbral se quedaba colgado en la posición arrastrada, con el velo a
 * media opacidad, mientras el guardado seguía en vuelo (tercera ronda de
 * revisión final) — la única de las cuatro vías de cierre en la que
 * "sigue como estaba" no era del todo cierto. Si se aprueba, se cancela
 * ese `settle()` (`stopMotion()`) antes de arrancar la animación de
 * salida de verdad, para que no queden dos muelles compitiendo por `y`.
 *
 * `closingRef` (segunda ronda de revisión final): `dismiss` no se puede
 * reentrar mientras un cierre sigue en curso — ni desde otra vía (botón,
 * velo, Escape) ni desde la misma. Antes, `dismiss` siempre empezaba por
 * `stopMotion()`, que cancela el muelle/temporizador de salida SIN llamar
 * a `onClose`: un segundo Escape mientras la animación de salida seguía
 * en vuelo (~300ms; 120ms con movimiento reducido) la cancelaba a medias
 * y volvía a consultar `canClose`, que en `DashboardEditSheet` devolvía
 * `false` porque su guarda local de reentrada se había quedado en `true`
 * — desde ahí ningún cierre volvía a funcionar, con la capa `position:
 * fixed; inset: 0; zIndex: 80` encima de la app hasta recargar. La guarda
 * va aquí, en el componente compartido, no en cada hoja: es
 * `useSheetDrag`/`Sheet` quien asume que `onClose` siempre desmonta, así
 * que es aquí donde hay que impedir un segundo intento mientras el
 * primero sigue abierto. Se libera de nuevo en cuanto `canClose` deniega
 * o rechaza (para poder reintentar) o nunca, si el cierre llega a
 * completarse (la hoja se desmonta con `onClose`, así que ya no importa).
 *
 * Tercera ronda — dos ajustes más sobre `closingRef`:
 *
 * - `void Promise.resolve(canClose()).then(...)` no tenía `.catch`: si
 *   `canClose` (o su promesa) rechazaba en vez de devolver `false`,
 *   `closingRef` se quedaba en `true` para siempre y ni Escape, ni velo,
 *   ni botón, ni arrastre volvían a funcionar — una trampa para el
 *   siguiente `canClose` que no envuelva su única espera en `try/catch`
 *   (hoy `DashboardEditSheet.canClose` sí lo hace, así que el caso no se
 *   alcanza, pero el contrato de `useSheetDrag` no debe depender de que
 *   quien lo use lo haga bien).
 * - `onPointerDown` volvía a bloquearse igual mientras `closingRef` fuera
 *   `true`, lo que impedía agarrar el asa durante la animación de salida
 *   — al contrario de lo que dice el párrafo de arriba ("Interrumpible en
 *   pleno vuelo"), una propiedad deliberada del gesto. Se recupera:
 *   agarrar el asa cancela cualquier cierre automático en curso (como
 *   siempre lo hizo `stopMotion()`) y además libera `closingRef`, para que
 *   un intento de cerrar posterior no se quede bloqueado por un cierre
 *   que ya se interrumpió físicamente. (Excepción no cubierta, y dejada
 *   anotada a propósito: si se agarra el asa MIENTRAS `canClose` sigue
 *   esperando red — antes de que exista ninguna animación que
 *   interrumpir — esa promesa pendiente no se cancela; si resuelve
 *   `true` más tarde, `runCloseAnimation` arrancará con la velocidad del
 *   gesto ORIGINAL, pudiendo pisar un arrastre nuevo ya en marcha. Es un
 *   caso extremo — guardado en red resolviendo justo mientras se re-agarra
 *   el asa — no cubierto por esta ronda.)
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
      // Vuelve a reposo MIENTRAS se espera la respuesta, no solo si al
      // final deniega — la única forma de que las cuatro vías de cierre
      // (botón, velo, Escape, arrastre) dejen la hoja "exactamente como
      // estaba" durante la espera, no solo al final de ella.
      settle(velocity);
      void Promise.resolve(canClose())
        .then((allowed) => {
          if (!allowed) {
            closingRef.current = false;
            return;
          }
          // Cancela el muelle de `settle` (si seguía en marcha) antes de
          // arrancar el de salida — dos muelles a la vez pelearían por `y`.
          stopMotion();
          runCloseAnimation(0);
        })
        .catch(() => {
          // `canClose` rechazó en vez de resolver `false`: mismo trato que
          // un veto — no dejar `closingRef` atascado para siempre.
          closingRef.current = false;
        });
    },
    [canClose, runCloseAnimation, settle, stopMotion],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Agarrar el asa interrumpe cualquier cierre automático en curso —
      // "Interrumpible en pleno vuelo" de verdad, no solo mientras no hay
      // ningún cierre en marcha. `stopMotion()` (más abajo) ya cancela el
      // muelle/temporizador de salida; liberar `closingRef` aquí es lo que
      // permite que un intento de cerrar POSTERIOR no se quede bloqueado
      // por uno que ya se canceló a mano. Ver el comentario de arriba
      // sobre el caso extremo que esto no cubre (`canClose` todavía
      // esperando red cuando se re-agarra el asa).
      closingRef.current = false;
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
