/**
 * Dashboard por miembro (diseño §7).
 *
 * El layout es una regla, no estado de pantalla: qué widgets existen, en qué
 * orden, con qué tamaño y qué hacer con un layout que viene de una versión
 * distinta de la app. Vive aquí y no en `Today.tsx` porque lo leen la
 * pantalla, la hoja de personalizar y las dos capas de datos, y tres copias
 * de "qué hago con un id que no conozco" divergen el día que se añade un
 * widget.
 *
 * **Nada de esto lanza.** Un layout corrupto tiene que dar la pantalla por
 * defecto, no una pantalla en blanco al abrir la app.
 */

export type WidgetSize = 'full' | 'half';

export type WidgetId =
  | 'kcal_ring'
  | 'today_meals'
  | 'quick_log'
  | 'week_progress'
  | 'cookable_now'
  | 'expiring_soon'
  | 'shopping_summary'
  | 'for_you'
  | 'whose_turn';

export interface WidgetSpec {
  id: WidgetId;
  /** Tamaños admitidos. El primero es el de por defecto y el de repuesto. */
  sizes: readonly [WidgetSize, ...WidgetSize[]];
  /** `true` si el widget solo existe con los turnos encendidos (§10). */
  needsTurns?: boolean;
}

export interface WidgetItem {
  id: WidgetId;
  w: WidgetSize;
  on: boolean;
}

/** Lo que hace falta saber del hogar para decidir qué widgets existen. */
export interface WidgetAvailability {
  turns: boolean;
}

/**
 * El catálogo, en el orden por defecto. Añadir un widget aquí basta: el
 * normalizador lo mete al final, encendido, en el layout de todo el mundo.
 */
export const WIDGET_CATALOG: readonly WidgetSpec[] = [
  { id: 'kcal_ring', sizes: ['full', 'half'] },
  { id: 'today_meals', sizes: ['full'] },
  { id: 'week_progress', sizes: ['full', 'half'] },
  { id: 'quick_log', sizes: ['full', 'half'] },
  { id: 'whose_turn', sizes: ['half'], needsTurns: true },
  { id: 'for_you', sizes: ['full', 'half'] },
  { id: 'cookable_now', sizes: ['full', 'half'] },
  { id: 'expiring_soon', sizes: ['full', 'half'] },
  { id: 'shopping_summary', sizes: ['full', 'half'] },
];

const SPEC_BY_ID = new Map<WidgetId, WidgetSpec>(WIDGET_CATALOG.map((s) => [s.id, s]));

function availableSpecs(av: WidgetAvailability): WidgetSpec[] {
  return WIDGET_CATALOG.filter((s) => (s.needsTurns ? av.turns : true));
}

/** El layout de quien nunca ha tocado nada: todo el catálogo, encendido. */
export const DEFAULT_LAYOUT: readonly WidgetItem[] = WIDGET_CATALOG.map((s) => ({
  id: s.id,
  w: s.sizes[0],
  on: true,
}));

function defaultFor(av: WidgetAvailability): WidgetItem[] {
  return availableSpecs(av).map((s) => ({ id: s.id, w: s.sizes[0], on: true }));
}

/** Un elemento cualquiera de JSON → `WidgetItem`, o `null` si no vale. */
function readItem(raw: unknown, av: WidgetAvailability): WidgetItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  const spec = SPEC_BY_ID.get(r.id as WidgetId);
  if (!spec) return null;
  if (spec.needsTurns && !av.turns) return null;
  const w =
    typeof r.w === 'string' && (spec.sizes as readonly string[]).includes(r.w)
      ? (r.w as WidgetSize)
      : spec.sizes[0];
  // Sin `on` es el formato literal de la spec (`[{id, w}]`): todo encendido.
  const on = r.on === undefined ? true : r.on === true;
  return { id: spec.id, w, on };
}

/**
 * Deja un layout utilizable pase lo que pase:
 *
 * - ids desconocidos fuera (un widget que ya no existe),
 * - tamaño inválido → el primero del widget,
 * - duplicados → se queda el primero,
 * - widgets del catálogo que el layout no conocía → al final, encendidos,
 * - nada aprovechable → el layout por defecto.
 *
 * Que un widget apagado siga en la lista (con `on: false`) es justo lo que
 * distingue "lo apagué" de "es nuevo". Ver la nota del plan de esta fase.
 */
export function normalizeLayout(raw: unknown, av: WidgetAvailability): WidgetItem[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : [];

  const out: WidgetItem[] = [];
  const seen = new Set<WidgetId>();
  for (const el of arr) {
    const item = readItem(el, av);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }

  if (out.length === 0) return defaultFor(av);

  for (const spec of availableSpecs(av)) {
    if (!seen.has(spec.id)) out.push({ id: spec.id, w: spec.sizes[0], on: true });
  }
  return out;
}

/** Lo que se pinta, en orden. Lo apagado sigue en el layout pero no aquí. */
export function visibleWidgets(layout: readonly WidgetItem[]): WidgetItem[] {
  return layout.filter((i) => i.on);
}

/** Intercambia con el vecino. Fuera de rango o id ausente: layout intacto. */
export function moveWidget(
  layout: readonly WidgetItem[],
  id: WidgetId,
  dir: 'up' | 'down',
): WidgetItem[] {
  const i = layout.findIndex((it) => it.id === id);
  if (i < 0) return [...layout];
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= layout.length) return [...layout];
  const out = [...layout];
  const a = out[i]!;
  const b = out[j]!;
  out[i] = b;
  out[j] = a;
  return out;
}

/** Cambia el tamaño. Un tamaño que el widget no admite se ignora. */
export function setWidgetSize(
  layout: readonly WidgetItem[],
  id: WidgetId,
  w: WidgetSize,
): WidgetItem[] {
  return layout.map((it) => {
    if (it.id !== id) return it;
    const spec = SPEC_BY_ID.get(id);
    if (!spec || !(spec.sizes as readonly WidgetSize[]).includes(w)) return it;
    return { ...it, w };
  });
}

/** Enciende o apaga sin mover de sitio: volver a encenderlo lo deja donde estaba. */
export function setWidgetOn(
  layout: readonly WidgetItem[],
  id: WidgetId,
  on: boolean,
): WidgetItem[] {
  return layout.map((it) => (it.id === id ? { ...it, on } : it));
}

/**
 * Columnas de la rejilla (§7.2). Por debajo de 600px una sola: en el móvil
 * el tamaño no se nota y el orden sí.
 */
export function columnsFor(isMedium: boolean, isWide: boolean): 1 | 2 | 3 {
  if (isWide) return 3;
  return isMedium ? 2 : 1;
}

/** Columnas que ocupa un widget. `full` nunca pasa de dos. */
export function spanFor(w: WidgetSize, columns: 1 | 2 | 3): number {
  if (columns === 1) return 1;
  return w === 'full' ? 2 : 1;
}
