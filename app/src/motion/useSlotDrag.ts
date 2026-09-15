import { useCallback, useRef, useState } from 'react';

export interface DragState {
  id: string;
  x: number;
  y: number;
  slot: string | null;
}

/**
 * Arrastre de una receta a un hueco del plan.
 *
 * Los huecos se marcan con `data-slot="{fechaISO}|{franja}"`. Los listeners van
 * en `window`, no en el elemento, para no perder el gesto al salir de sus
 * límites. El fantasma DEBE llevar `pointer-events: none`, o `elementFromPoint`
 * lo devuelve a él en vez del hueco y nada funciona.
 */
export function useSlotDrag(onDrop: (id: string, slot: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const set = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const slotUnder = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[data-slot]')?.getAttribute('data-slot') ?? null;
  };

  const start = useCallback(
    (id: string) => (event: React.PointerEvent) => {
      event.preventDefault();
      set({ id, x: event.clientX, y: event.clientY, slot: null });

      const move = (e: PointerEvent) => {
        set({ id, x: e.clientX, y: e.clientY, slot: slotUnder(e.clientX, e.clientY) });
      };

      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      };

      const up = (e: PointerEvent) => {
        stop();
        const slot = slotUnder(e.clientX, e.clientY);
        if (slot) onDrop(id, slot);
        set(null);
      };

      // El sistema se ha quedado el puntero: se suelta sin añadir nada al plan.
      const cancel = () => {
        stop();
        set(null);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [onDrop, set],
  );

  return { drag, start };
}
