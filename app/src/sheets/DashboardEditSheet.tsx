import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
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
 * `disabled` (ronda de arreglo 1, hallazgo (b)): `true` mientras
 * `dashboardLayoutLoading` — la copia local todavía es el layout por
 * defecto de mientras tanto, no el de esta persona, así que nada de esta
 * fila debe poder tocarse hasta que llegue el de verdad. Apaga el
 * interruptor, el segmentado, subir/bajar y el asa de arrastre a la vez.
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
      <Switch checked={item.on} onChange={onToggle} ariaLabel={t.dashboardShow(name)} disabled={disabled} />
      {canSize && (
        <div
          style={{
            width: 132,
            flex: '0 0 132px',
            // La propia `SegmentedControl` no admite `disabled` — se apaga
            // por fuera, igual que el asa de arrastre de arriba.
            pointerEvents: disabled ? 'none' : undefined,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <SegmentedControl<WidgetSize>
            value={item.w}
            onChange={onSize}
            options={[
              { value: 'full', label: t.dashboardSizeFull },
              { value: 'half', label: t.dashboardSizeHalf },
            ]}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <IconButton
          ariaLabel={t.dashboardUp(name)}
          size={height.touch}
          disabled={isFirst || disabled}
          onClick={() => onMove('up')}
        >
          <Icon name="chevronUp" size={18} strokeWidth={2} />
        </IconButton>
        <IconButton
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

  const handleMove = (id: WidgetItem['id'], dir: 'up' | 'down') => {
    const next = moveWidget(layout, id, dir);
    apply(next);
    const i = next.findIndex((it) => it.id === id);
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

  // El arrastre acaba de soltarse (el índice arrastrado vuelve a `null`
  // tras el muelle de regreso): anuncia por el mismo `aria-live` que ya usan
  // subir/bajar, con la posición final ya asentada en `layout`.
  const lastDragIndex = useRef<number | null>(null);
  useEffect(() => {
    if (dragIndex !== null) {
      lastDragIndex.current = dragIndex;
      return;
    }
    const i = lastDragIndex.current;
    lastDragIndex.current = null;
    if (i === null) return;
    const item = layout[i];
    if (item) setAnnouncement(t.dashboardMoved(nameOf(item.id), i + 1, layout.length));
  }, [dragIndex, layout, t]);

  const handleReset = () => {
    apply(normalizeLayout(null, { turns: turnsEnabled }));
    setAnnouncement('');
  };

  /**
   * (a) Cerrar espera de verdad al guardado. Antes, `onClose()` se llamaba
   * sin esperar la promesa: si `setDashboardLayout` fallaba, el toast
   * llegaba con la hoja ya desmontada (`layout` perdido con ella) y sin
   * nada que reintentar, porque la mutación nunca llegó a cuajar. Ahora
   * solo se desmonta tras un guardado que sí ha ido bien, o si no había
   * nada que guardar — igual que `MemberTargetSheet.tsx::save()`. `closing`
   * evita que un segundo Escape/X mientras la primera petición sigue en
   * vuelo dispare una segunda en paralelo; si la primera falla, se limpia
   * y un nuevo intento de cerrar reintenta el mismo guardado.
   */
  const handleClose = () => {
    if (closing) return;
    if (!dirty.current) {
      onClose();
      return;
    }
    setClosing(true);
    void setDashboardLayout(layout)
      .then(() => onClose())
      .catch(() => {
        onToast?.(t.memberActionError);
        setClosing(false);
      });
  };

  return (
    <Sheet title={t.dashboardTitle} onClose={handleClose}>
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
