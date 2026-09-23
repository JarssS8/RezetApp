import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, spring } from './motion';

/**
 * Altura fija de cada fila de la lista reordenable (px).
 *
 * Fijada aquí y solo aquí: quien pinta las filas (`DashboardEditSheet.tsx`)
 * importa esta misma constante para su `height`/posición, así la aritmética
 * del arrastre (índice × altura) y lo que se ve en pantalla no pueden
 * divergir.
 *
 * Aritmética (ronda de arreglo 1, hallazgo (a) — antes 120, sin cuentas):
 * con `box-sizing: border-box` global (`tokens.css`), el contenido
 * disponible de una fila es `ROW_HEIGHT − padding vertical − borde`, y
 * `DashboardRow` fija `padding: '12px 15px'` (24px verticales) y
 * `borderBottom: 1px`. En 7 de los 9 widgets del catálogo (todos salvo
 * `today_meals` y `whose_turn`, que solo tienen un tamaño y por tanto no
 * pintan el segmentado) el ancho de hoja de un móvil estrecho no llega
 * para una sola línea y la fila envuelve a dos:
 *   - línea 1 — asa + nombre + interruptor: el elemento más alto es el
 *     asa/interruptor, `height.touch = 44`.
 *   - línea 2 — segmentado + subir/bajar: el segmentado mide exactamente
 *     `height.segment (38) + 2×padding de pista (3) = 44`
 *     (`SegmentedControl.tsx`), igual que subir/bajar (`height.touch = 44`)
 *     — las dos columnas de la línea miden 44 también.
 *   - más el `gap: 10` entre líneas del propio contenedor flex-wrap.
 *   Contenido mínimo = 44 + 10 + 44 = 98px.
 *   ROW_HEIGHT mínimo = 98 + 24 (padding) + 1 (borde) = 123px — exacto, sin
 *   margen. Se deja un colchón de 9px para no ir clavado al límite (metrics
 *   de fuente/zoom del navegador pueden variar el alto de la línea 1, que
 *   hoy solo queda por debajo de 44 por el texto del nombre, no por ningún
 *   valor fijo): 123 + 9 = 132.
 */
export const ROW_HEIGHT = 132;

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
 * Un solo arrastre a la vez: `dragIndex`/`offset`/`startY`/`startIndex` son
 * compartidos por todas las filas, no van indexados por fila. Un segundo
 * puntero (otro dedo sobre otra asa) mientras el primero sigue en curso se
 * ignora entero en `onPointerDown` — ver el comentario junto a
 * `activePointerId` más abajo.
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
  // Ronda de arreglo 1, hallazgo (b): `startY`/`startIndex` y el estado
  // `dragIndex`/`offset` son compartidos por todas las filas — un solo
  // arrastre a la vez. Sin este identificador, un segundo dedo que toca OTRA
  // asa mientras el primero sigue capturado pisaba esas referencias antes de
  // que `onPointerDown` mutara nada, y los siguientes `pointermove` del
  // primer dedo (que sigue pasando el guard de `hasPointerCapture` de SU
  // propia asa) calculaban con el `startY`/`startIndex` del segundo.
  const activePointerId = useRef<number | null>(null);

  useEffect(() => () => cancelSpring.current?.(), []);

  const settle = useCallback((from: number) => {
    cancelSpring.current?.();
    if (prefersReducedMotion()) {
      cancelSpring.current = null;
      activePointerId.current = null;
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
        activePointerId.current = null;
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
        // (b) Ya hay un arrastre en curso (otro dedo, otra asa): se ignora
        // por completo, sin tocar `startY`/`startIndex`/`dragIndex`/`offset`
        // del primero. Sin este corte temprano, capturar el segundo puntero
        // es válido de por sí (cada asa puede capturar el suyo), pero pisa
        // el estado compartido antes de que el primer arrastre haya podido
        // usarlo.
        if (activePointerId.current !== null) return;
        event.preventDefault();
        cancelSpring.current?.();
        cancelSpring.current = null;
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointerId.current = event.pointerId;
        startY.current = event.clientY;
        startIndex.current = index;
        setDragIndex(index);
        setOffset(0);
      },
      // `onPointerMove`/`onPointerUp` son handlers normales del asa: sin
      // esta comprobación también dispararían con un simple hover o un
      // click suelto que nunca pasó por `onPointerDown`. El chequeo de
      // `pointerId` (además de `hasPointerCapture`) es la mitad (b) que
      // falta en el lado de lectura: solo procesa el gesto del puntero que
      // de verdad inició este arrastre, nunca el de uno segundo.
      onPointerMove: (event) => {
        if (event.pointerId !== activePointerId.current) return;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.preventDefault();
        const raw = event.clientY - startY.current - (index - startIndex.current) * itemHeight;
        const { index: nextIndex, offset: nextOffset } = resolve(index, raw);
        setDragIndex(nextIndex);
        setOffset(nextOffset);
      },
      onPointerUp: (event) => {
        if (event.pointerId !== activePointerId.current) return;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const raw = event.clientY - startY.current - (index - startIndex.current) * itemHeight;
        const { offset: nextOffset } = resolve(index, raw);
        settle(nextOffset);
      },
      onPointerCancel: (event) => {
        if (event.pointerId !== activePointerId.current) return;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        settle(offset);
      },
    }),
    [itemHeight, offset, resolve, settle],
  );

  return { dragIndex, offset, handlers };
}
