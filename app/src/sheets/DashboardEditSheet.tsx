import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import {
  WIDGET_CATALOG,
  moveWidget,
  normalizeLayout,
  setWidgetOn,
  setWidgetSize,
  type WidgetItem,
  type WidgetSize,
} from '../domain/dashboard';
import { ROW_HEIGHT, useListReorder, type RowDragHandlers } from '../motion/useListReorder';
import { EASE_SHEET } from '../motion/motion';
import { Sheet } from '../ui/Sheet';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ListCard } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { height, radius, text as T } from '../ui/tokens';

const SIZES_BY_ID = new Map(WIDGET_CATALOG.map((s) => [s.id, s.sizes]));

/**
 * Ids de DOM estables por fila (I3, revisión final de rama): dejan
 * encontrar un control concreto con `document.getElementById` desde
 * `handleMove`, para moverle el foco justo antes de que React deshabilite
 * el botón que se acaba de pulsar. Ni `Pressable`/`IconButton` reenvían
 * `ref`, así que un `id` es más simple que añadir `forwardRef` a un
 * primitivo compartido por otras 22 hojas solo para este caso.
 */
function rowMoveId(id: WidgetItem['id'], dir: 'up' | 'down'): string {
  return `dashboard-row-${dir}-${id}`;
}
function rowSwitchId(id: WidgetItem['id']): string {
  return `dashboard-row-switch-${id}`;
}

/**
 * Interruptor accesible, igual que el de `NotifySheet.tsx`, pero con
 * `aria-label` propio en vez de un `<label>` que envuelva texto visible: en
 * esta fila el nombre del widget ya se pinta aparte, junto al resto de
 * controles (tamaño, subir, bajar), así que reutilizar ese texto como
 * etiqueta del interruptor sería ambiguo.
 */
function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      style={{
        appearance: 'none',
        WebkitAppearance: 'none',
        flex: '0 0 44px',
        width: 44,
        height: 26,
        margin: 0,
        borderRadius: radius.pill,
        border: '1px solid var(--line)',
        background: checked ? 'var(--accent)' : 'var(--surface2)',
        backgroundImage: 'radial-gradient(circle, var(--surface) 42%, transparent 44%)',
        backgroundSize: '20px 20px',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: checked ? 'right 3px center' : 'left 3px center',
        boxShadow: 'var(--shadow-s)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color .18s ease, background-position .18s cubic-bezier(.2,.75,.2,1)',
      }}
    />
  );
}

/**
 * Una fila del layout: asa de arrastre, nombre, interruptor, tamaño (si
 * admite más de uno) y subir/bajar.
 *
 * `style` la posiciona (índice × `ROW_HEIGHT`, Tarea 8); se aplica al mismo
 * div raíz que ya llevaba el borde y el padding, no a un envoltorio nuevo,
 * para no duplicar el layout de la fila en dos sitios.
 *
 * `disabled` (ronda de arreglo 1, hallazgo (b); ronda 2 lo completa): `true`
 * mientras `dashboardLayoutLoading` — la copia local todavía es el layout
 * por defecto de mientras tanto, no el de esta persona, así que nada de
 * esta fila debe poder tocarse hasta que llegue el de verdad. Apaga el
 * interruptor, el segmentado (con el `disabled` nativo de
 * `SegmentedControl`, no un envoltorio con `pointerEvents` — eso bloquea
 * ratón y toque pero no Tab ni Enter/Espacio sobre el `<button>`), subir/
 * bajar y el asa de arrastre a la vez.
 */
function DashboardRow({
  item,
  name,
  isFirst,
  isLast,
  onToggle,
  onSize,
  onMove,
  dragHandlers,
  dragging,
  disabled,
  style,
}: {
  item: WidgetItem;
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (on: boolean) => void;
  onSize: (w: WidgetSize) => void;
  onMove: (dir: 'up' | 'down') => void;
  dragHandlers: RowDragHandlers;
  dragging: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const { t } = usePrefs();
  const sizes = SIZES_BY_ID.get(item.id) ?? ['full'];
  const canSize = sizes.length > 1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        alignContent: 'center',
        flexWrap: 'wrap',
        gap: 10,
        padding: '12px 15px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
        boxShadow: dragging ? 'var(--shadow-m)' : undefined,
        ...style,
      }}
    >
      {/*
        El asa arrastra, no la fila: con la fila entera arrastrando, en
        móvil no se podría desplazar la lista con el dedo. `aria-hidden`
        porque subir/bajar ya cubren su función para quien usa lector de
        pantalla o teclado — anunciarla también sería ruido.
      */}
      <span
        aria-hidden="true"
        {...(disabled ? {} : dragHandlers)}
        style={{
          flex: '0 0 auto',
          display: 'grid',
          placeItems: 'center',
          width: height.touch,
          height: height.touch,
          color: 'var(--muted)',
          cursor: disabled ? 'default' : 'grab',
          touchAction: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Icon name="grip" size={18} strokeWidth={2} />
      </span>
      <div
        style={{
          ...T.row,
          flex: '1 1 90px',
          minWidth: 0,
          color: item.on ? 'var(--text)' : 'var(--muted)',
        }}
      >
        {name}
      </div>
      <Switch
        checked={item.on}
        onChange={onToggle}
        ariaLabel={t.dashboardShow(name)}
        disabled={disabled}
        id={rowSwitchId(item.id)}
      />
      {canSize && (
        <div style={{ width: 132, flex: '0 0 132px' }}>
          <SegmentedControl<WidgetSize>
            value={item.w}
            onChange={onSize}
            options={[
              { value: 'full', label: t.dashboardSizeFull },
              { value: 'half', label: t.dashboardSizeHalf },
            ]}
            disabled={disabled}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <IconButton
          id={rowMoveId(item.id, 'up')}
          ariaLabel={t.dashboardUp(name)}
          size={height.touch}
          disabled={isFirst || disabled}
          onClick={() => onMove('up')}
        >
          <Icon name="chevronUp" size={18} strokeWidth={2} />
        </IconButton>
        <IconButton
          id={rowMoveId(item.id, 'down')}
          ariaLabel={t.dashboardDown(name)}
          size={height.touch}
          disabled={isLast || disabled}
          onClick={() => onMove('down')}
        >
          <Icon name="chevronDown" size={18} strokeWidth={2} />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * Modo "Personalizar" de Hoy (§7.3): encender/apagar, cambiar de tamaño y
 * reordenar cada widget, usable entero por teclado — el arrastre (Tarea 8)
 * es un añadido, no el único camino.
 *
 * El layout se edita en una COPIA local (`layout`), nunca escribiendo en
 * cada toque: reordenar son muchos toques seguidos y una escritura por
 * toque es una ráfaga de round-trips que además puede llegar desordenada.
 * Se guarda una sola vez, al cerrar.
 *
 * Resincronización: a diferencia de `NotifySheet` (que confirma cada campo
 * al toque y por eso puede resincronizar sin más en cada cambio de la fila
 * real), aquí la copia local vive sin guardar mientras la hoja está
 * abierta. Si se resincronizara siempre que cambia `dashboardLayout`, un
 * refetch de fondo (p.ej. la pestaña recupera el foco) pisaría en
 * silencio lo que la persona ya había movido. La resincronización solo
 * corre mientras la copia sigue intacta (antes del primer toque) — cubre
 * el caso real: la hoja se abre antes de que la consulta real haya
 * resuelto y la copia inicial es el valor por defecto de mientras tanto;
 * en cuanto llega el layout de verdad, esta hoja lo adopta. Tras el primer
 * toque, la copia local manda hasta que se cierre la hoja.
 *
 * Ronda de arreglo 1 — dos hallazgos Important corregidos:
 *
 * (a) Cerrar ya no es un disparo y olvido. `setDashboardLayout` se espera
 * de verdad: si falla, la hoja NO se cierra (la copia local con todo lo
 * editado sigue viva) y se avisa por `onToast`; solo se llama a `onClose`
 * tras un guardado que sí ha ido bien, o si no había nada que guardar. Un
 * segundo intento de cerrar reintenta el mismo guardado — igual que
 * `MemberTargetSheet.tsx::save()`.
 *
 * (b) La hoja abre igual, pero deshabilitada mientras
 * `dashboardLayoutLoading` es `true`: interruptor, segmentado, subir/bajar
 * y arrastre de cada fila, más "Volver al orden inicial" (que también
 * marca `dirty` y congelaría la resincronización si se tocara antes de
 * saber el layout real). En la demo `dashboardLayoutLoading` es siempre
 * `false`, así que ahí no cambia nada.
 *
 * Ronda de arreglo final — dos hallazgos Important más:
 *
 * (c) I2: cerrar podía fallar (el guardado en red) y `Sheet`/`useSheetDrag`
 * asumían que `onClose` siempre desmonta. Ahora esta hoja pasa `canClose`
 * a `<Sheet>` — un veto que se consulta ANTES de que empiece cualquier
 * animación de salida — y `onClose` vuelve a ser el de verdad, sin
 * envolver. Ver el comentario en `canClose` más abajo y en
 * `useSheetDrag.ts`.
 *
 * (d) I3: `key={item.id}` hace que el nodo del botón sobreviva al
 * reordenado — al llevar un widget al tope, el botón recién pulsado pasa a
 * `disabled` bajo el foco, el navegador lo devuelve a `document.body`, y
 * la trampa de Tab de `Sheet.tsx` deja pasar el siguiente Tab por detrás
 * de la hoja. `handleMove` mueve el foco a un botón hermano (o al
 * interruptor de la fila) ANTES de aplicar el reordenado. Ver el
 * comentario en `handleMove` más abajo.
 *
 * Ronda de arreglo 2 — (b) no estaba cerrado del todo: el segmentado de
 * tamaño se apagaba con un envoltorio `pointerEvents: 'none'`, que bloquea
 * ratón y toque pero no Tab ni Enter/Espacio sobre el `<button>` nativo —
 * quien navegaba por teclado podía tabular hasta él durante la carga y
 * cambiar el tamaño igualmente. `SegmentedControl` ahora tiene un
 * `disabled` de verdad (`src/ui/SegmentedControl.tsx`), que llega hasta
 * cada `Pressable`; aquí ya no hace falta el envoltorio ni una opacidad
 * aparte (la propia `SegmentedControl` se atenúa cuando está `disabled`).
 */
export function DashboardEditSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast?: (message: string) => void;
}) {
  const { t } = usePrefs();
  const { dashboardLayout, dashboardLayoutLoading, setDashboardLayout, household } = useData();
  const turnsEnabled = household?.turnsEnabled ?? false;

  const [layout, setLayout] = useState<WidgetItem[]>(() => dashboardLayout);
  const [announcement, setAnnouncement] = useState('');
  const [closing, setClosing] = useState(false);
  const dirty = useRef(false);

  // Ver el comentario de arriba: solo antes del primer toque.
  useEffect(() => {
    if (!dirty.current) setLayout(dashboardLayout);
  }, [dashboardLayout]);

  const nameOf = (id: WidgetItem['id']) => t.widgetName[id];

  const apply = (next: WidgetItem[]) => {
    dirty.current = true;
    setLayout(next);
  };

  /**
   * I3 (revisión final de rama): como `key={item.id}`, el nodo del botón
   * sobrevive al reordenado y conserva el foco. Al llevar un widget al
   * tope, el botón que se acaba de pulsar pasa a `disabled` BAJO el foco
   * — un `<button disabled>` lo pierde al vuelo, el navegador lo devuelve
   * a `document.body`, y la trampa de Tab de `Sheet.tsx` deja de casar
   * (`activeElement` no es ni el primero ni el último), así que el
   * siguiente Tab escapa de la hoja modal.
   *
   * El foco se mueve ANTES de aplicar el reordenado — mientras el DOM
   * todavía tiene el botón pulsado habilitado — al botón hermano (la otra
   * dirección, en la misma fila): si el widget sube al primer puesto,
   * "bajar" sigue activo salvo que la lista tenga un único elemento (caso
   * en que ambos ya estaban deshabilitados de entrada, así que no se
   * llega aquí). Si el hermano también fuera a quedar deshabilitado, cae
   * al interruptor de la fila, que el tope nunca deshabilita.
   */
  const handleMove = (id: WidgetItem['id'], dir: 'up' | 'down') => {
    const next = moveWidget(layout, id, dir);
    const i = next.findIndex((it) => it.id === id);
    if (i >= 0) {
      const pressedWillBeDisabled = dir === 'up' ? i === 0 : i === next.length - 1;
      if (pressedWillBeDisabled) {
        const opposite = dir === 'up' ? 'down' : 'up';
        const oppositeWillBeDisabled = opposite === 'up' ? i === 0 : i === next.length - 1;
        const targetId = oppositeWillBeDisabled ? rowSwitchId(id) : rowMoveId(id, opposite);
        document.getElementById(targetId)?.focus();
      }
    }
    apply(next);
    if (i >= 0) setAnnouncement(t.dashboardMoved(nameOf(id), i + 1, next.length));
  };

  // Arrastre (Tarea 8): un añadido sobre el mismo `moveWidget` que usan los
  // botones de subir/bajar, nunca un `splice` propio — cada frontera de fila
  // cruzada es un swap adyacente sobre la copia local.
  const { dragIndex, offset, handlers: dragHandlers } = useListReorder({
    count: layout.length,
    onMove: (from, to) => {
      setLayout((prev) => {
        const id = prev[from]?.id;
        if (!id) return prev;
        dirty.current = true;
        return moveWidget(prev, id, to > from ? 'down' : 'up');
      });
    },
  });

  // El arrastre acaba de soltarse (el índice arrastrado vuelve a `null` tras
  // el muelle de regreso): anuncia por el mismo `aria-live` que ya usan
  // subir/bajar, con la posición final ya asentada en `layout`.
  //
  // Ronda de arreglo 1, hallazgo (c): un simple toque en el asa (down
  // seguido de up sin mover un píxel) también hace que `dragIndex` pase de
  // no-nulo a nulo — el muelle de `offset: 0 → 0` termina en el primer
  // frame igual que uno de verdad. `dragStartIndex` guarda dónde EMPEZÓ el
  // arrastre (solo la primera vez que se ve `dragIndex` no-nulo en esta
  // tanda) para compararlo con dónde terminó: si es el mismo índice, no se
  // anuncia nada — ni el toque sin mover, ni arrastrar la primera fila hacia
  // arriba contra el tope (`moveWidget` ya deja el layout intacto ahí a
  // propósito). Es la misma regla que ya usa el teclado: el botón de subir
  // de la primera fila está `disabled`, así que tampoco anuncia nada al
  // "no pasar" nada.
  const dragStartIndex = useRef<number | null>(null);
  const lastDragIndex = useRef<number | null>(null);
  useEffect(() => {
    if (dragIndex !== null) {
      if (dragStartIndex.current === null) dragStartIndex.current = dragIndex;
      lastDragIndex.current = dragIndex;
      return;
    }
    const start = dragStartIndex.current;
    const end = lastDragIndex.current;
    dragStartIndex.current = null;
    lastDragIndex.current = null;
    if (end === null || start === end) return;
    const item = layout[end];
    if (item) setAnnouncement(t.dashboardMoved(nameOf(item.id), end + 1, layout.length));
  }, [dragIndex, layout, t]);

  const handleReset = () => {
    apply(normalizeLayout(null, { turns: turnsEnabled }));
    setAnnouncement('');
  };

  /**
   * (a) Cerrar espera de verdad al guardado: si `setDashboardLayout`
   * falla, no se cierra (la copia local con todo lo editado sigue viva) y
   * se avisa por `onToast`. `closing` evita que un segundo Escape/X
   * mientras la primera petición sigue en vuelo dispare una segunda en
   * paralelo; si la primera falla, se limpia y un nuevo intento de cerrar
   * reintenta el mismo guardado — igual que `MemberTargetSheet.tsx::save()`.
   *
   * I2 (revisión final de rama): esto ya NO se le pasa a `<Sheet>` como
   * `onClose` — se le pasa como `canClose`, aparte. `onClose` vuelve a ser
   * el de verdad, el que dio el padre, sin envolver: siempre desmonta,
   * nunca falla, igual que en las otras 22 hojas. `dismiss()` (en
   * `useSheetDrag.ts`) consulta `canClose` ANTES de tocar ningún estado
   * visual, así que mientras esto está en vuelo la hoja sigue exactamente
   * como estaba — interactiva, opaca — y si devuelve `false` no hay nada
   * que revertir porque nada llegó a cambiar. Solo cuando devuelve `true`
   * arranca la animación de salida y, al terminar, `onClose` desmonta.
   */
  const canClose = useCallback(async (): Promise<boolean> => {
    if (closing) return false;
    if (!dirty.current) return true;
    setClosing(true);
    try {
      await setDashboardLayout(layout);
      return true;
    } catch {
      onToast?.(t.memberActionError);
      setClosing(false);
      return false;
    }
  }, [closing, layout, onToast, setDashboardLayout, t]);

  return (
    <Sheet title={t.dashboardTitle} onClose={onClose} canClose={canClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45 }}>{t.dashboardHint}</div>

        {/*
          Filas posicionadas por `transform` (índice × `ROW_HEIGHT`), no por
          flujo normal: es lo que permite que la fila arrastrada siga al
          puntero con un simple `offset` y que sus vecinas se limiten a
          transicionar de un índice al siguiente cuando `layout` cambia de
          orden, sin recalcular nada geométrico aparte.
        */}
        {/*
          (b) Mientras `dashboardLayoutLoading` es `true`, `layout` todavía
          es el layout por defecto de mientras tanto, no el de esta
          persona: la lista se atenúa (`opacity`, `aria-busy`) y cada fila
          se deshabilita (`disabled`, más abajo) para que nada de lo que se
          toque aquí se pierda cuando llegue el de verdad.
        */}
        <div aria-busy={dashboardLayoutLoading}>
          <ListCard
            style={{
              position: 'relative',
              height: layout.length * ROW_HEIGHT,
              opacity: dashboardLayoutLoading ? 0.55 : 1,
              transition: 'opacity .15s ease',
            }}
          >
            {layout.map((item, i) => {
              const dragging = dragIndex === i;
              return (
                <DashboardRow
                  key={item.id}
                  item={item}
                  name={nameOf(item.id)}
                  isFirst={i === 0}
                  isLast={i === layout.length - 1}
                  onToggle={(on) => apply(setWidgetOn(layout, item.id, on))}
                  onSize={(w) => apply(setWidgetSize(layout, item.id, w))}
                  onMove={(dir) => handleMove(item.id, dir)}
                  dragHandlers={dragHandlers(i)}
                  dragging={dragging}
                  disabled={dashboardLayoutLoading}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    transform: `translateY(${i * ROW_HEIGHT + (dragging ? offset : 0)}px)`,
                    transition: dragging ? 'none' : `transform 220ms ${EASE_SHEET}`,
                    zIndex: dragging ? 1 : 0,
                  }}
                />
              );
            })}
          </ListCard>
        </div>

        <div aria-live="polite" style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', minHeight: 18 }}>
          {announcement}
        </div>

        <Button variant="secondary" full onClick={handleReset} disabled={dashboardLayoutLoading}>
          {t.dashboardReset}
        </Button>
      </div>
    </Sheet>
  );
}
