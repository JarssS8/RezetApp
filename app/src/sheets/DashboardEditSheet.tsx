import { useEffect, useRef, useState } from 'react';
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
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={ariaLabel}
      checked={checked}
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
        cursor: 'pointer',
        transition: 'background-color .18s ease, background-position .18s cubic-bezier(.2,.75,.2,1)',
      }}
    />
  );
}

/** Una fila del layout: nombre, interruptor, tamaño (si admite más de uno) y subir/bajar. */
function DashboardRow({
  item,
  name,
  isFirst,
  isLast,
  onToggle,
  onSize,
  onMove,
}: {
  item: WidgetItem;
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (on: boolean) => void;
  onSize: (w: WidgetSize) => void;
  onMove: (dir: 'up' | 'down') => void;
}) {
  const { t } = usePrefs();
  const sizes = SIZES_BY_ID.get(item.id) ?? ['full'];
  const canSize = sizes.length > 1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        padding: '12px 15px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        style={{
          ...T.row,
          flex: '1 1 110px',
          minWidth: 0,
          color: item.on ? 'var(--text)' : 'var(--muted)',
        }}
      >
        {name}
      </div>
      <Switch checked={item.on} onChange={onToggle} ariaLabel={t.dashboardShow(name)} />
      {canSize && (
        <div style={{ width: 132, flex: '0 0 132px' }}>
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
          disabled={isFirst}
          onClick={() => onMove('up')}
        >
          <Icon name="chevronUp" size={18} strokeWidth={2} />
        </IconButton>
        <IconButton
          ariaLabel={t.dashboardDown(name)}
          size={height.touch}
          disabled={isLast}
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
 */
export function DashboardEditSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast?: (message: string) => void;
}) {
  const { t } = usePrefs();
  const { dashboardLayout, setDashboardLayout, household } = useData();
  const turnsEnabled = household?.turnsEnabled ?? false;

  const [layout, setLayout] = useState<WidgetItem[]>(() => dashboardLayout);
  const [announcement, setAnnouncement] = useState('');
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

  const handleReset = () => {
    apply(normalizeLayout(null, { turns: turnsEnabled }));
    setAnnouncement('');
  };

  const handleClose = () => {
    if (dirty.current) {
      void setDashboardLayout(layout).catch(() => onToast?.(t.memberActionError));
    }
    onClose();
  };

  return (
    <Sheet title={t.dashboardTitle} onClose={handleClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45 }}>{t.dashboardHint}</div>

        <ListCard>
          {layout.map((item, i) => (
            <DashboardRow
              key={item.id}
              item={item}
              name={nameOf(item.id)}
              isFirst={i === 0}
              isLast={i === layout.length - 1}
              onToggle={(on) => apply(setWidgetOn(layout, item.id, on))}
              onSize={(w) => apply(setWidgetSize(layout, item.id, w))}
              onMove={(dir) => handleMove(item.id, dir)}
            />
          ))}
        </ListCard>

        <div aria-live="polite" style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', minHeight: 18 }}>
          {announcement}
        </div>

        <Button variant="secondary" full onClick={handleReset}>
          {t.dashboardReset}
        </Button>
      </div>
    </Sheet>
  );
}
