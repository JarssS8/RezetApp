import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, spring } from './motion';

/**
 * Altura fija de cada fila de la lista reordenable (px).
 *
 * Fijada aquí y solo aquí: quien pinta las filas (`DashboardEditSheet.tsx`)
 * importa esta misma constante para su `height`/posición, así la aritmética
 * del arrastre (índice × altura) y lo que se ve en pantalla no pueden
 * divergir. Bastante alta para el caso más ancho de una fila del dashboard
 * (nombre + interruptor en una línea, tamaño + subir/bajar en la siguiente,
 * cuando el hueco disponible no llega para una sola línea) sin recortar
 * contenido en ninguna fila, aunque no necesite las dos líneas.
 */
export const ROW_HEIGHT = 120;

export interface RowDragHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

export interface UseListReorderOptions {
  /** Número de filas. Fija el límite de arriba/abajo hasta el que se puede cruzar. */
  count: number;
  /** Altura de fila a usar en la aritmética; por defecto `ROW_HEIGHT`. */
  itemHeight?: number;
  /**
   * Cada vez que el arrastre cruza el límite de una fila vecina, un swap
   * adyacente: exactamente lo que `moveWidget(layout, id, 'up' | 'down')`
   * ya sabe hacer. Nunca se reordena aquí de golpe; quien llama traduce cada
   * aviso a una llamada de `moveWidget` (o a lo que envuelva ese dominio).
   */
  onMove: (from: number, to: number) => void;
}

/**
 * Arrastrar-para-reordenar de una lista de filas de altura fija (Tarea 8).
 *
 * No es `useSlotDrag`: aquí no hay un `data-slot` bajo el puntero que
 * consultar con `elementFromPoint` — hay que saber cuántas filas ha cruzado
 * el gesto y traducir cada cruce en un swap con el vecino, uno por
 * frontera, para que quien llama nunca tenga que reimplementar el
 * reordenado (siempre pasa por `onMove`, que aquí arriba solo delega en
 * `moveWidget`).
 *
 * Punteros unificados: `onPointerDown` captura el puntero sobre el propio
 * asa (`setPointerCapture`), así que los `onPointerMove`/`onPointerUp`
 * siguientes llegan a esa misma asa pase lo que pase por debajo del dedo —
 * sin distinguir ratón de táctil y sin listeners en `window`.
 *
 * La fila activa se posiciona con `offset` (sigue al puntero 1:1, sin
 * transición). Las demás no las mueve este hook: se reordenan solas al
 * re-renderizar con el nuevo `layout` — es la propia hoja quien les pone
 * una transición CSS al cambiar de índice.
 *
 * Al soltar, `offset` vuelve a 0 con el mismo muelle de `motion.ts` (no una
 * de las constantes propias: las de aquí no se tocan) en vez de saltar.
 */
export function useListReorder({ count, itemHeight = ROW_HEIGHT, onMove }: UseListReorderOptions): {
  dragIndex: number | null;
  offset: number;
  handlers: (index: number) => RowDragHandlers;
} {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const startY = useRef(0);
  const startIndex = useRef(0);
  const cancelSpring = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelSpring.current?.(), []);

  const settle = useCallback((from: number) => {
    cancelSpring.current?.();
    if (prefersReducedMotion()) {
      cancelSpring.current = null;
      setDragIndex(null);
      setOffset(0);
      return;
    }
    cancelSpring.current = spring(
      from,
      0,
      0,
      (v) => setOffset(v),
      () => {
        cancelSpring.current = null;
        setDragIndex(null);
        setOffset(0);
      },
    );
  }, []);

  // Recorre, desde `index`/`rawOffset`, cuántas fronteras de fila se han
  // cruzado y avisa un swap adyacente por cada una. Devuelve dónde queda la
  // fila (su nuevo índice) y el resto del desplazamiento sin consumir.
  const resolve = useCallback(
    (index: number, rawOffset: number): { index: number; offset: number } => {
      let idx = index;
      let off = rawOffset;
      while (off > itemHeight / 2 && idx < count - 1) {
        onMove(idx, idx + 1);
        idx += 1;
        off -= itemHeight;
      }
      while (off < -itemHeight / 2 && idx > 0) {
        onMove(idx, idx - 1);
        idx -= 1;
        off += itemHeight;
      }
      return { index: idx, offset: off };
    },
    [count, itemHeight, onMove],
  );

  const handlers = useCallback(
    (index: number): RowDragHandlers => ({
      onPointerDown: (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        cancelSpring.current?.();
        cancelSpring.current = null;
        event.currentTarget.setPointerCapture(event.pointerId);
        startY.current = event.clientY;
        startIndex.current = index;
        setDragIndex(index);
        setOffset(0);
      },
      // `onPointerMove`/`onPointerUp` son handlers normales del asa: sin
      // esta comprobación también dispararían con un simple hover o un
      // click suelto que nunca pasó por `onPointerDown`. Solo procesan el
      // gesto cuando el puntero está realmente capturado por ESTE asa.
      onPointerMove: (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.preventDefault();
        const raw = event.clientY - startY.current - (index - startIndex.current) * itemHeight;
        const { index: nextIndex, offset: nextOffset } = resolve(index, raw);
        setDragIndex(nextIndex);
        setOffset(nextOffset);
      },
      onPointerUp: (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const raw = event.clientY - startY.current - (index - startIndex.current) * itemHeight;
        const { offset: nextOffset } = resolve(index, raw);
        settle(nextOffset);
      },
      onPointerCancel: (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        settle(offset);
      },
    }),
    [itemHeight, offset, resolve, settle],
  );

  return { dragIndex, offset, handlers };
}
