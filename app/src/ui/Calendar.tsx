import { useMemo, useState } from 'react';
import { Button, IconButton } from './Button';
import { Icon } from './Icon';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WD_MON = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const WD_SUN = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export interface CalendarProps {
  /** Semana empieza en lunes. */
  mondayFirst?: boolean;
  /** Muestra los días del mes anterior/siguiente que completan la grilla. */
  showAdjacentDays?: boolean;
  /** Punto bajo el día si tiene evento. */
  showEventDots?: boolean;
  /** Fechas con evento, formato ISO (yyyy-mm-dd). */
  events?: string[];
  /** Fecha inicialmente seleccionada, ISO. Por defecto hoy. */
  initialSelected?: string;
  /** Se dispara al elegir un día (click en celda o "Hoy"). */
  onSelect?: (dateIso: string) => void;
}

/** Calendario mensual: navegación de mes, selección de día y puntos de evento. */
export function Calendar({
  mondayFirst = true,
  showAdjacentDays = true,
  showEventDots = true,
  events,
  initialSelected,
  onSelect,
}: CalendarProps) {
  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const [view, setView] = useState(() => {
    const d = initialSelected ? new Date(initialSelected) : today;
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(initialSelected ?? todayIso);

  const select = (dateIso: string, y: number, m: number) => {
    setSelected(dateIso);
    setView({ y, m });
    onSelect?.(dateIso);
  };

  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const { y, m } = view;
  const eventSet = useMemo(
    () =>
      new Set(
        events && events.length
          ? events
          : [iso(y, m, 4), iso(y, m, 12), iso(y, m, 13), iso(y, m, 21), iso(y, m, 27)],
      ),
    [events, y, m],
  );

  const cells = useMemo(() => {
    const first = new Date(y, m, 1).getDay();
    const lead = mondayFirst ? (first + 6) % 7 : first;
    const daysIn = new Date(y, m + 1, 0).getDate();
    const total = Math.ceil((lead + daysIn) / 7) * 7;
    const out: {
      key: string;
      label: number | '';
      onClick?: () => void;
      isSel: boolean;
      isToday: boolean;
      hasEvent: boolean;
      outside: boolean;
      hidden: boolean;
    }[] = [];
    for (let i = 0; i < total; i++) {
      const dayNum = i - lead + 1;
      const outside = dayNum < 1 || dayNum > daysIn;
      const date = new Date(y, m, dayNum);
      const key = iso(date.getFullYear(), date.getMonth(), date.getDate());
      const isSel = !outside && key === selected;
      const isToday = key === todayIso;
      const hidden = outside && !showAdjacentDays;
      out.push({
        key: `${i}-${key}`,
        label: hidden ? '' : date.getDate(),
        onClick: hidden ? undefined : () => select(key, date.getFullYear(), date.getMonth()),
        isSel,
        isToday: isToday && !hidden,
        hasEvent: showEventDots && eventSet.has(key) && !hidden,
        outside,
        hidden,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m, mondayFirst, showAdjacentDays, showEventDots, eventSet, selected, todayIso]);

  const sel = selected.split('-').map(Number) as [number, number, number];
  const selectedLabel = `${sel[2]} de ${MONTHS[sel[1] - 1]} de ${sel[0]}`;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 22,
        boxShadow: 'var(--shadow-m)',
        padding: '18px 18px 14px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 650,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            {y}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text)',
              textTransform: 'capitalize',
              lineHeight: 1.2,
            }}
          >
            {MONTHS[m]}
          </div>
        </div>
        <IconButton ariaLabel="Mes anterior" size={36} onClick={() => shift(-1)}>
          <Icon name="chevronLeft" size={18} />
        </IconButton>
        <IconButton ariaLabel="Mes siguiente" size={36} onClick={() => shift(1)}>
          <Icon name="chevronRight" size={18} />
        </IconButton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 6 }}>
        {(mondayFirst ? WD_MON : WD_SUN).map((wd) => (
          <div
            key={wd}
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              padding: '4px 0',
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            disabled={!c.onClick}
            style={{
              position: 'relative',
              height: 46,
              border: 'none',
              padding: 0,
              background: 'transparent',
              font: 'inherit',
              cursor: c.onClick ? 'pointer' : 'default',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 14,
            }}
          >
            {c.isSel && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 14,
                  background: 'var(--accent)',
                  boxShadow: 'var(--shadow-s)',
                }}
              />
            )}
            {!c.isSel && c.isToday && (
              <span style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'var(--soft)' }} />
            )}
            {!c.hidden && (
              <span
                style={{
                  position: 'relative',
                  fontSize: 15,
                  fontWeight: c.isSel || c.isToday ? 700 : 500,
                  color: c.isSel
                    ? 'var(--onaccent)'
                    : c.isToday
                      ? 'var(--accent-ink)'
                      : c.outside
                        ? 'var(--muted)'
                        : 'var(--text)',
                  opacity: c.outside && !c.isSel && !c.isToday ? 0.55 : 1,
                }}
              >
                {c.label}
              </span>
            )}
            {c.hasEvent && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 7,
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: c.isSel ? 'var(--onaccent)' : 'var(--accent)',
                }}
              />
            )}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 14,
          paddingTop: 13,
          borderTop: '1px solid var(--line)',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: 'var(--muted)',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedLabel}
        </div>
        <Button
          variant={selected === todayIso ? 'secondary' : 'primary'}
          size="secondary"
          onClick={() => select(todayIso, today.getFullYear(), today.getMonth())}
        >
          Hoy
        </Button>
      </div>
    </div>
  );
}
