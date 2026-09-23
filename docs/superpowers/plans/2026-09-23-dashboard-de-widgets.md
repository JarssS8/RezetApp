# Dashboard de widgets (fase 3) — plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que cada miembro del hogar decida qué ve al abrir la app, en qué orden y con qué tamaño, y que esa decisión le siga a cualquier dispositivo.

**Arquitectura:** la pantalla Hoy deja de ser una lista fija de bloques y pasa a pintar una rejilla a partir de un layout por miembro. Cada bloque actual se extrae tal cual a un componente de widget (sin cambiar comportamiento) y se suman cuatro widgets nuevos. El layout vive en `member_dashboard.layout` (JSONB, una fila por miembro) porque el usuario pidió personalización **por persona**, y `prefs` es por dispositivo. Toda la lógica de layout —catálogo, normalización, mover, tamaños, columnas— vive en `domain/dashboard.ts`, pura y con tests; la pantalla solo pinta.

**Stack:** React 19 + TypeScript, TanStack Query, Supabase (Postgres + RLS), vitest + banco de migraciones PGlite. Primitivas propias de `src/ui/` — ninguna librería de componentes.

**Spec:** `docs/superpowers/specs/2026-09-20-personalizacion-por-miembro-design.md` §7 (y §3.2 para el nivel de privacidad, §3.4 para dónde van las reglas).

## Restricciones globales

Copiadas de `CLAUDE.md` y de la spec. Aplican a **todas** las tareas; no se repiten en cada una.

- **Las reglas de negocio viven en `domain/` y solo ahí.** Nada de aritmética de layout, de kcal ni de cobertura dentro de un componente.
- **Solo tokens de color.** Ningún hex suelto. `--accent`/`--warn` son rellenos; texto sobre fondo claro usa `--accent-ink`/`--warn-ink`; texto sobre relleno de acento usa `--onaccent`.
- **Nada de librerías de componentes** (Material, Ant, Chakra, shadcn). Todo sale de `src/ui/`.
- **Área táctil mínima 44px** (`README.md` §8). Hay `height.touch` en los tokens.
- **Cada cadena nueva va a `src/i18n/es.ts` y `src/i18n/en.ts`,** en la misma tarea que la introduce. Una cadena en un solo idioma es un fallo de la tarea.
- **Las dos capas de datos implementan el mismo contrato.** Lo que se añade a `src/data/storeContext.ts` se implementa en `src/data/store.tsx` (demo, `localStorage`) **y** en la capa real. Si divergen a propósito, se anota en el documento de pendientes al cerrar la fase.
- **El SQL se prueba en el banco de migraciones, nunca contra producción.** Ningún agente ejecuta `apply_migration`, `supabase db push`, `wrangler` ni `git push`.
- **El prefijo de una migración nueva es posterior a `20260921100300`.** Usa `20260923HHMMSS`.
- **`npm run lint` y `npm test` en verde antes de cada commit.** Sin excepciones.
- **Commits en español**, formato del repo (`feat(scope): …`, `fix(scope): …`), terminados con la línea `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Foco de revisión

Los cinco casos que la spec da por supuestos y que ninguna tarea probaría sola. Cada uno tiene ya su test asignado en la tarea que posee el código.

1. **Un layout guardado por una versión futura de la app** (ids desconocidos, tamaños inválidos, JSON que no es ni array ni objeto) **no puede dejar Hoy en blanco.** Debe caer al layout por defecto sin lanzar. → Tarea 1.
2. **Apagar un widget debe sobrevivir a la normalización.** Si "oculto" se codifica como "ausente", el normalizador lo vuelve a añadir como widget nuevo y el usuario no puede apagar nada. → Tarea 1.
3. **`whose_turn` con los turnos apagados** no debe aparecer ni en la rejilla ni en el catálogo de personalizar — "apagado = no existe" (§10). Y al volver a encender los turnos debe reaparecer. → Tarea 1 (disponibilidad) y Tarea 6 (rejilla).
4. **Un miembro sin fila en `member_dashboard`** (todo el mundo, el primer día) ve el layout por defecto, y la primera personalización crea la fila. → Tarea 3.
5. **En móvil (una columna) el tamaño no se nota pero el orden sí:** un layout con `half` intercalados debe pintarse en el mismo orden en una, dos y tres columnas. → Tarea 6.

---

## Estructura de ficheros

**Nuevos**
- `app/src/domain/dashboard.ts` — catálogo, layout, normalización, movimientos, columnas.
- `app/src/domain/__tests__/dashboard.test.ts` — sus tests.
- `app/supabase/migrations/20260923HHMMSS_rezet_member_dashboard.sql` — tabla + RLS + grants.
- `app/src/data/supabaseStore/useDashboard.ts` — query + mutación del layout, capa real.
- `app/src/screens/today/Widgets.tsx` — los widgets extraídos y los nuevos, en un solo fichero (ver nota abajo).
- `app/src/sheets/DashboardEditSheet.tsx` — modo "Personalizar".

**Modificados**
- `app/src/types.ts` — tipos públicos del layout.
- `app/src/data/storeContext.ts` — contrato `dashboardLayout` / `setDashboardLayout`.
- `app/src/data/store.tsx` — implementación demo.
- `app/src/data/supabaseStore.tsx` — monta `useDashboard`.
- `app/src/data/supabaseStore/keys.ts` — clave de query.
- `app/src/hooks/useMediaQuery.ts` — `useIsMedium` (≥600px).
- `app/src/screens/Today.tsx` — pasa de lista fija a rejilla.
- `app/src/App.tsx` — abre la hoja de personalizar.
- `app/src/i18n/es.ts`, `app/src/i18n/en.ts`.
- `app/supabase/tests/migrations.test.ts`.

**Por qué un solo `Widgets.tsx` y no un fichero por widget:** son nueve componentes de presentación que comparten la misma tarjeta, los mismos tokens y los mismos props de datos; repartidos en nueve ficheros de 40 líneas se pierde más en saltar entre ellos de lo que se gana. Si pasa de ~600 líneas, se parte en `Widgets.tsx` (rejilla + envoltorio) y `widgets/*.tsx`.

---

## Tarea 1: `domain/dashboard.ts` — el layout como regla, no como estado de pantalla

**Modelo:** Sonnet. Es la pieza con más decisiones de corrección de toda la fase.

**Ficheros:**
- Crear: `app/src/domain/dashboard.ts`
- Crear: `app/src/domain/__tests__/dashboard.test.ts`
- Modificar: `app/src/types.ts` (añadir al final, junto a los demás tipos de miembro)

**Interfaces:**
- Consume: nada. Es la primera tarea y no depende de nada del repo salvo tipos.
- Produce (las tareas 3, 6 y 7 dependen de estos nombres exactos):
  - `type WidgetId`, `type WidgetSize`, `interface WidgetItem { id: WidgetId; w: WidgetSize; on: boolean }`
  - `WIDGET_CATALOG: readonly WidgetSpec[]`, `DEFAULT_LAYOUT: readonly WidgetItem[]`
  - `interface WidgetAvailability { turns: boolean }`
  - `normalizeLayout(raw: unknown, av: WidgetAvailability): WidgetItem[]`
  - `visibleWidgets(layout: readonly WidgetItem[]): WidgetItem[]`
  - `moveWidget(layout: readonly WidgetItem[], id: WidgetId, dir: 'up' | 'down'): WidgetItem[]`
  - `setWidgetSize(layout: readonly WidgetItem[], id: WidgetId, w: WidgetSize): WidgetItem[]`
  - `setWidgetOn(layout: readonly WidgetItem[], id: WidgetId, on: boolean): WidgetItem[]`
  - `columnsFor(isMedium: boolean, isWide: boolean): 1 | 2 | 3`
  - `spanFor(w: WidgetSize, columns: 1 | 2 | 3): number`

### Decisión de diseño que este plan toma sobre la spec

La spec §7 dice dos cosas que no pueden ser ciertas a la vez: *"lo ausente está oculto"* y *"widgets nuevos se añaden al final, visibles"*. Si ocultar es borrar del array, el normalizador no distingue "lo apagué yo" de "salió en la versión nueva" y **vuelve a encender lo que el usuario apagó**. Un dashboard al que no se le puede apagar nada no es personalizable.

Resolución: el layout guarda **todos** los widgets que la persona ha visto, cada uno con `on`. Ausente = nunca visto = se añade al final encendido. El formato antiguo (array de `{id, w}` sin `on`) se acepta en lectura tratando cada elemento como encendido, así que la forma literal de la spec sigue siendo válida como entrada.

Forma guardada: `{ "v": 1, "items": [{ "id": "kcal_ring", "w": "full", "on": true }, …] }`.

- [ ] **Paso 1: escribir los tests que fallan**

Crea `app/src/domain/__tests__/dashboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  columnsFor,
  DEFAULT_LAYOUT,
  moveWidget,
  normalizeLayout,
  setWidgetOn,
  setWidgetSize,
  spanFor,
  visibleWidgets,
  WIDGET_CATALOG,
  type WidgetItem,
} from '../dashboard';

const ALL = { turns: true };
const NO_TURNS = { turns: false };

describe('normalizeLayout', () => {
  it('un layout vacío, nulo o corrupto cae al layout por defecto', () => {
    for (const raw of [null, undefined, 0, 'nope', {}, [], { v: 1, items: [] }]) {
      expect(normalizeLayout(raw, ALL)).toEqual([...DEFAULT_LAYOUT]);
    }
  });

  it('descarta ids desconocidos sin lanzar', () => {
    const out = normalizeLayout(
      { v: 1, items: [{ id: 'kcal_ring', w: 'full', on: true }, { id: 'ovni', w: 'full', on: true }] },
      ALL,
    );
    expect(out.map((i) => i.id)).not.toContain('ovni');
    expect(out[0]).toEqual({ id: 'kcal_ring', w: 'full', on: true });
  });

  it('un tamaño inválido cae al primero de la lista del widget', () => {
    const out = normalizeLayout({ v: 1, items: [{ id: 'kcal_ring', w: 'gigante' }] }, ALL);
    expect(out.find((i) => i.id === 'kcal_ring')!.w).toBe('full');
  });

  it('acepta el array pelado de la spec y lo trata como todo encendido', () => {
    const out = normalizeLayout([{ id: 'today_meals', w: 'full' }], ALL);
    expect(out[0]).toEqual({ id: 'today_meals', w: 'full', on: true });
  });

  it('respeta un widget apagado: no lo reenciende como si fuera nuevo', () => {
    const saved = WIDGET_CATALOG.map((s) => ({ id: s.id, w: s.sizes[0], on: s.id !== 'cookable_now' }));
    const out = normalizeLayout({ v: 1, items: saved }, ALL);
    expect(out.find((i) => i.id === 'cookable_now')!.on).toBe(false);
  });

  it('añade al final y encendido un widget que el layout guardado no conocía', () => {
    const out = normalizeLayout({ v: 1, items: [{ id: 'kcal_ring', w: 'full', on: true }] }, ALL);
    expect(out[0].id).toBe('kcal_ring');
    expect(out).toHaveLength(WIDGET_CATALOG.length);
    for (const item of out.slice(1)) expect(item.on).toBe(true);
  });

  it('descarta duplicados quedándose con el primero', () => {
    const out = normalizeLayout(
      { v: 1, items: [{ id: 'kcal_ring', w: 'half', on: false }, { id: 'kcal_ring', w: 'full', on: true }] },
      ALL,
    );
    expect(out.filter((i) => i.id === 'kcal_ring')).toHaveLength(1);
    expect(out.find((i) => i.id === 'kcal_ring')).toEqual({ id: 'kcal_ring', w: 'half', on: false });
  });

  it('con los turnos apagados, whose_turn no existe; al encenderlos vuelve', () => {
    const sinTurnos = normalizeLayout(null, NO_TURNS);
    expect(sinTurnos.map((i) => i.id)).not.toContain('whose_turn');
    const conTurnos = normalizeLayout({ v: 1, items: sinTurnos }, ALL);
    expect(conTurnos.map((i) => i.id)).toContain('whose_turn');
    expect(conTurnos.find((i) => i.id === 'whose_turn')!.on).toBe(true);
  });

  it('con los turnos apagados, un whose_turn guardado se descarta', () => {
    const guardado = [{ id: 'whose_turn', w: 'half', on: false }];
    const sinTurnos = normalizeLayout({ v: 1, items: guardado }, NO_TURNS);
    expect(sinTurnos.map((i) => i.id)).not.toContain('whose_turn');
  });
});

describe('movimientos', () => {
  const base: WidgetItem[] = [
    { id: 'kcal_ring', w: 'full', on: true },
    { id: 'today_meals', w: 'full', on: true },
    { id: 'quick_log', w: 'half', on: true },
  ];

  it('mover arriba el primero no hace nada', () => {
    expect(moveWidget(base, 'kcal_ring', 'up')).toEqual(base);
  });

  it('mover abajo el último no hace nada', () => {
    expect(moveWidget(base, 'quick_log', 'down')).toEqual(base);
  });

  it('mover un id que no está deja el layout intacto', () => {
    expect(moveWidget(base, 'for_you', 'up')).toEqual(base);
  });

  it('mover abajo intercambia con el siguiente', () => {
    expect(moveWidget(base, 'kcal_ring', 'down').map((i) => i.id)).toEqual([
      'today_meals',
      'kcal_ring',
      'quick_log',
    ]);
  });

  it('no muta el array de entrada', () => {
    const copia = [...base];
    moveWidget(base, 'kcal_ring', 'down');
    expect(base).toEqual(copia);
  });

  it('setWidgetSize ignora un tamaño que el widget no admite', () => {
    const out = setWidgetSize(base, 'today_meals', 'half');
    expect(out.find((i) => i.id === 'today_meals')!.w).toBe('full');
  });

  it('setWidgetOn apaga sin sacarlo del orden', () => {
    const out = setWidgetOn(base, 'today_meals', false);
    expect(out.map((i) => i.id)).toEqual(base.map((i) => i.id));
    expect(out[1].on).toBe(false);
    expect(visibleWidgets(out).map((i) => i.id)).toEqual(['kcal_ring', 'quick_log']);
  });
});

describe('rejilla', () => {
  it('columnas por ancho', () => {
    expect(columnsFor(false, false)).toBe(1);
    expect(columnsFor(true, false)).toBe(2);
    expect(columnsFor(true, true)).toBe(3);
  });

  it('en una columna todo ocupa uno: el tamaño no se nota, el orden sí', () => {
    expect(spanFor('half', 1)).toBe(1);
    expect(spanFor('full', 1)).toBe(1);
  });

  it('full ocupa las dos columnas de la rejilla media', () => {
    expect(spanFor('full', 2)).toBe(2);
    expect(spanFor('half', 2)).toBe(1);
  });

  it('con tres columnas full ocupa dos, no tres', () => {
    expect(spanFor('full', 3)).toBe(2);
    expect(spanFor('half', 3)).toBe(1);
  });
});
```

- [ ] **Paso 2: ejecutar y ver que falla**

Ejecuta: `cd app && npx vitest run src/domain/__tests__/dashboard.test.ts`
Esperado: FAIL, "Failed to resolve import '../dashboard'".

- [ ] **Paso 3: escribir `app/src/domain/dashboard.ts`**

```ts
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
  [out[i], out[j]] = [out[j], out[i]];
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
```

Añade al final de `app/src/types.ts`:

```ts
export type { WidgetId, WidgetItem, WidgetSize } from './domain/dashboard';
```

- [ ] **Paso 4: ejecutar los tests**

Ejecuta: `cd app && npx vitest run src/domain/__tests__/dashboard.test.ts` → PASS (todos).
Después `npm run lint` → sin errores.

- [ ] **Paso 5: commit**

```bash
git add app/src/domain/dashboard.ts app/src/domain/__tests__/dashboard.test.ts app/src/types.ts
git commit -F /tmp/msg.txt
```

Mensaje (escríbelo antes en `/tmp/msg.txt`):

```
feat(domain): catálogo y normalización del dashboard por miembro

El layout de Hoy pasa a ser una regla de dominio: qué widgets existen, en
qué orden, con qué tamaño y qué hacer con un layout guardado por otra
versión de la app. No lanza nunca — un layout corrupto da el layout por
defecto, no una pantalla en blanco.

Un widget apagado se guarda con `on: false` en vez de borrarse de la
lista. La spec §7 decía a la vez "lo ausente está oculto" y "los widgets
nuevos se añaden al final, visibles", que no pueden ser ciertas a la vez:
con "oculto = ausente" el normalizador reenciende lo que el usuario
apagó. Se acepta igualmente el array pelado de la spec al leer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 2: la tabla `member_dashboard`

**Modelo:** Sonnet. Es SQL con RLS.

**Ficheros:**
- Crear: `app/supabase/migrations/20260923HHMMSS_rezet_member_dashboard.sql` (sustituye `HHMMSS` por la hora real; tiene que ser posterior a `20260921100300`)
- Modificar: `app/supabase/tests/migrations.test.ts` (añadir al final, siguiendo el estilo de los `describe` que ya hay)

**Interfaces:**
- Consume: `private.can_act_for(uuid)` de `20260920090000_rezet_member_foundation.sql`.
- Produce: la tabla `public.member_dashboard(member_id uuid primary key, layout jsonb not null, updated_at timestamptz)`, que lee la Tarea 3.

- [ ] **Paso 1: escribir la migración**

```sql
-- Diseño §7 — el dashboard de cada persona.
--
-- Va en tabla y no en `prefs` a propósito: `prefs` es por dispositivo y lo
-- que se pidió es personalización por miembro. Un dashboard que no te sigue
-- al segundo dispositivo no es lo que se pidió.
--
-- `layout` es JSONB y no una tabla-por-widget porque se lee y se escribe
-- siempre entero: no hay ninguna consulta que pregunte por un widget suelto.
-- El esquema de dentro lo valida `domain/dashboard.ts`, que nunca lanza; la
-- base solo exige que sea JSON.

create table public.member_dashboard (
  member_id  uuid primary key references public.member(id) on delete cascade,
  layout     jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.member_dashboard enable row level security;

-- Nivel "propio" (§3.2): lo tuyo, y lo de quien tutelas. `can_act_for` ya
-- comprueba las tres cosas a la vez — vivo, mismo hogar, y tuyo o tutelado.
create policy member_dashboard_rw on public.member_dashboard for all
  to authenticated
  using ((select private.can_act_for(member_dashboard.member_id)))
  with check ((select private.can_act_for(member_dashboard.member_id)));

revoke all on public.member_dashboard from anon, authenticated;
grant select, insert, update, delete on public.member_dashboard to authenticated;

comment on column public.member_dashboard.layout is
  'Lista de widgets con orden, tamaño y encendido. La valida domain/dashboard.ts; aquí solo se exige JSON.';
```

- [ ] **Paso 2: escribir los tests del banco**

Al final de `app/supabase/tests/migrations.test.ts`, con el mismo estilo que los de `notify_pref` (busca `notify_pref: cada uno ve y edita solo el suyo` y cópiale la forma, incluidos los ayudantes que uses para crear hogar y miembros):

```ts
describe('dashboard por miembro', () => {
  it('dashboard: cada uno ve y edita solo el suyo', async () => {
    // Dos hogares distintos con un miembro cada uno; Bea guarda su layout y
    // Ana no lo ve. Sin esto, el dashboard sería un canal de fuga entre hogares.
  });

  it('dashboard: un tutelado lo gestiona quien lo tutela', async () => {
    // Ana guarda el layout de Nico (is_ward) y lo lee.
  });

  it('dashboard: otro adulto del mismo hogar no puede escribir el tuyo', async () => {
    // El insert de Ana sobre el member_id de Bea tiene que ser rechazado por
    // el `with check`, no solo quedar invisible al leer: una política `for
    // select` no protege un INSERT.
  });

  it('dashboard: borrar el miembro se lleva su dashboard', async () => {
    // `on delete cascade`.
  });
});
```

Escríbelos completos, con SQL real, siguiendo el patrón de los que ya existen. **Regla del banco:** las aserciones de RLS van por `asUser(db, uid, sql)`; cualquier otra cosa corre como superusuario y se salta RLS, así que un test de RLS escrito sin `asUser` pasa siempre y no prueba nada.

- [ ] **Paso 3: ejecutar el banco**

Ejecuta: `cd app && npx vitest run supabase/tests/migrations.test.ts`
Esperado: todos verdes, incluidos los cuatro nuevos.

- [ ] **Paso 4: comprobar que el test de escritura ajena prueba lo que dice**

Quita temporalmente la línea `with check (...)` de la política en la migración y vuelve a ejecutar el banco. El test "otro adulto del mismo hogar no puede escribir el tuyo" **tiene que ponerse rojo**. Si sigue verde, el test está mal escrito: arréglalo. Restaura la línea después y vuelve a ejecutar.

- [ ] **Paso 5: commit**

```bash
git add app/supabase/migrations/ app/supabase/tests/migrations.test.ts
git commit -F /tmp/msg.txt
```

Mensaje:

```
feat(db): tabla member_dashboard con RLS por can_act_for

El layout de Hoy de cada persona, en tabla y no en `prefs`: `prefs` es por
dispositivo y lo que se pidió es por miembro.

JSONB porque se lee y se escribe siempre entero. La validación del
contenido vive en `domain/dashboard.ts`, que no lanza nunca; la base solo
exige JSON.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 3: el layout en el contrato `Store`, en las dos capas

**Modelo:** Sonnet.

**Ficheros:**
- Modificar: `app/src/data/storeContext.ts`
- Crear: `app/src/data/supabaseStore/useDashboard.ts`
- Modificar: `app/src/data/supabaseStore/keys.ts`, `app/src/data/supabaseStore.tsx`, `app/src/data/store.tsx`

**Interfaces:**
- Consume de la Tarea 1: `normalizeLayout`, `DEFAULT_LAYOUT`, `WidgetItem`, `WidgetAvailability`.
- Consume de la Tarea 2: la tabla `member_dashboard`.
- Produce (lo usan las tareas 6 y 7):
  - En `Store`: `dashboardLayout: WidgetItem[]` — **ya normalizado**, nunca vacío.
  - En `Store`: `setDashboardLayout: (layout: WidgetItem[]) => Promise<void>`.

- [ ] **Paso 1: añadir el contrato**

En `app/src/data/storeContext.ts`, junto a `notifyPref` / `setNotifyPref`:

```ts
  /**
   * El dashboard de quien está usando la app, ya normalizado por
   * `domain/dashboard.ts`: nunca vacío, nunca con ids desconocidos, nunca
   * con `whose_turn` si los turnos están apagados. La pantalla lo pinta tal
   * cual y no vuelve a validarlo.
   */
  dashboardLayout: WidgetItem[];
  /** Guarda el layout entero. Sin sesión de miembro no hace nada. */
  setDashboardLayout: (layout: WidgetItem[]) => Promise<void>;
```

- [ ] **Paso 2: clave de query**

En `app/src/data/supabaseStore/keys.ts`, dentro de `storeKeys`:

```ts
  dashboard: (householdId: string) => ['dashboard', householdId] as const,
```

- [ ] **Paso 3: escribir `useDashboard.ts`**

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { normalizeLayout, type WidgetAvailability, type WidgetItem } from '../../domain/dashboard';
import type { MemberId } from '../../types';

/**
 * El dashboard del miembro en sesión, capa real.
 *
 * La query devuelve el JSON crudo tal como está guardado; normalizar es
 * cosa de `domain/dashboard.ts` y se hace aquí en un `useMemo`, fuera de la
 * `queryFn`, para que TanStack pueda comparar estructuralmente lo que llega
 * del servidor. (Un `Map` o un objeto construido dentro de la `queryFn` no
 * se comparte estructuralmente y cambia de identidad en cada refetch, que
 * es el fallo que ya costó un formulario reseteándose en la fase 2.)
 */
export function useDashboard(
  householdId: string | null,
  myMemberId: MemberId | null,
  availability: WidgetAvailability,
) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: storeKeys.dashboard(householdId ?? 'none'),
    enabled: householdId !== null && myMemberId !== null,
    queryFn: async (): Promise<unknown> => {
      const { data, error } = await supabase
        .from('member_dashboard')
        .select('layout')
        .eq('member_id', myMemberId!)
        .maybeSingle();
      if (error) throw error;
      // Sin fila todavía: es el caso de todo el mundo el primer día, no un
      // error. `normalizeLayout(null)` da el layout por defecto.
      return data?.layout ?? null;
    },
  });

  const layout = useMemo(() => normalizeLayout(q.data ?? null, availability), [q.data, availability]);

  const save = useMutation({
    mutationFn: async (next: WidgetItem[]) => {
      if (!myMemberId) return;
      const { error } = await supabase.from('member_dashboard').upsert(
        {
          member_id: myMemberId,
          layout: { v: 1, items: next },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storeKeys.dashboard(householdId ?? 'none') });
    },
  });

  const setDashboardLayout = useCallback(
    async (next: WidgetItem[]) => {
      await save.mutateAsync(next);
    },
    [save],
  );

  return { dashboardLayout: layout, setDashboardLayout };
}
```

**Ojo con `availability`:** el objeto `{ turns }` se construye en `supabaseStore.tsx`; si se pasa como literal inline cambia de identidad en cada render y el `useMemo` no sirve de nada. Constrúyelo con su propio `useMemo` sobre `household?.turnsEnabled`.

- [ ] **Paso 4: montarlo en `supabaseStore.tsx`**

Llama a `useDashboard(householdId, myMemberId, availability)` junto a los demás hooks y añade `dashboardLayout` y `setDashboardLayout` al objeto del `value`, en el mismo sitio relativo que `notifyPref` / `setNotifyPref`.

- [ ] **Paso 5: la capa demo**

En `app/src/data/store.tsx`, siguiendo exactamente el patrón de `notifyPrefByMember`:

```ts
  /** Igual que `notifyPrefByMember`: por miembro, para que la demo enseñe lo
   * mismo que la real. Sin entrada, el layout por defecto. */
  dashboardByMember: Partial<Record<MemberId, WidgetItem[]>>;
```

con valor inicial `{}` en el estado sembrado, un `setDashboardLayout` que escribe en `dashboardByMember[DEMO_MY_MEMBER_ID]` y devuelve una promesa ya resuelta, y en el `value`:

```ts
      dashboardLayout: normalizeLayout(data.dashboardByMember[DEMO_MY_MEMBER_ID] ?? null, {
        turns: data.household.turnsEnabled,
      }),
      setDashboardLayout,
```

- [ ] **Paso 6: comprobar**

Ejecuta: `cd app && npm run lint` → sin errores (el contrato obliga a las dos capas; si falta una, `tsc` lo dice).
Ejecuta: `npm test` → todo verde, ninguno roto.

- [ ] **Paso 7: commit**

```bash
git add app/src/data/
git commit -F /tmp/msg.txt
```

Mensaje:

```
feat(data): el layout del dashboard en el contrato Store

Las dos capas exponen `dashboardLayout` ya normalizado: la pantalla no
vuelve a validar nada. Sin fila guardada —el caso de todo el mundo el
primer día— sale el layout por defecto, que no es un error.

La normalización se hace fuera de la `queryFn`, en un `useMemo`, para no
repetir el fallo de identidad que en la fase 2 reseteaba un formulario en
cada refetch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 4: extraer los bloques de Hoy a widgets, sin cambiar nada

**Modelo:** Haiku. Es mecánico y tiene un criterio de éxito objetivo: la pantalla se ve y se comporta igual.

**Ficheros:**
- Crear: `app/src/screens/today/Widgets.tsx`
- Modificar: `app/src/screens/Today.tsx`

**Interfaces:**
- Consume: nada nuevo. Solo mueve código que ya existe.
- Produce (los usan las tareas 5 y 6): cinco componentes exportados, cada uno recibiendo por props **exactamente** lo que el bloque usa hoy, sin leer contexto por su cuenta:
  - `KcalRingWidget`, `TodayMealsWidget`, `WeekProgressWidget`, `ForYouWidget`, `CookableNowWidget`
  - `WidgetCard` — el envoltorio común (`Eyebrow` + contenido), para que los nueve widgets se vean iguales.
  - `RecipeTile` — la baldosa de receta con nombre, minutos y kcal, hoy duplicada palabra por palabra entre "Para ti" y "Puedes cocinarlo ya".

**Esta tarea no añade ni quita comportamiento.** Ni una cadena nueva, ni un estilo distinto, ni un `useMemo` que cambie de sitio si con ello cambia cuándo se recalcula. Si al terminar hay una diferencia visible, es un fallo de la tarea.

- [ ] **Paso 1: crear `app/src/screens/today/Widgets.tsx` con `WidgetCard` y `RecipeTile`**

Cabecera del fichero:

```tsx
/**
 * Los widgets de Hoy (diseño §7).
 *
 * Son componentes de presentación: reciben por props lo que pintan y no
 * leen `useData()` ni `usePrefs()` por su cuenta. Así el orden en que la
 * rejilla los coloca no cambia cuántas veces consultan nada, y cada uno se
 * puede mirar solo.
 */
```

`WidgetCard({ label, children, style })`: un `<div>` con el `Eyebrow` del label (`margin: '0 4px 12px'`, como el de "Puedes cocinarlo ya" hoy) y debajo el contenido. Sin label, solo el contenido — el anillo hoy no lleva epígrafe y no se le añade.

`RecipeTile({ recipe, onOpen })`: copia literal del `Pressable` de baldosa de receta que hoy está duplicado, con los mismos estilos y las mismas dos líneas (nombre; `minutes` min · `kcalPerServing` kcal).

- [ ] **Paso 2: mover los cinco bloques**

Corta de `Today.tsx` y pega en `Widgets.tsx`, uno a uno, **sin tocar el JSX**:

| Componente | Qué es hoy | Props |
|---|---|---|
| `KcalRingWidget` | la `Card` del anillo | `{ pct, animatedPct, done, kcalLine, kcalHint, kcalHintColor, locale }` |
| `WeekProgressWidget` | el `Pressable` de "Tu semana" | `{ onOpenWeek, label }` |
| `TodayMealsWidget` | la sección "Tu día" entera: cabecera, `MealCard`s, extras, botón de añadir y la `Card` vacía | ver abajo |
| `ForYouWidget` | el bloque "Para ti" | `{ suggestions, onOpenRecipe, label, hint }` |
| `CookableNowWidget` | el bloque "Puedes cocinarlo ya" | `{ recipes, onOpenRecipe, label }` |

`MealCard` se va con `TodayMealsWidget` a `Widgets.tsx` (hoy vive al final de `Today.tsx`).

Props de `TodayMealsWidget`: `{ meals, entryById, recipeById, extraLines, turnsEnabled, myMemberId, removingExtraId, hasEntries, locale, onOpenRecipe, onCook, onSetShare, onRemoveExtra, onAddIntake, onGoPlan }`. Es una lista larga y está bien que lo sea: son las que el bloque ya usa. **No** conviertas el widget en consumidor de `useData()` para acortarla; eso es justo lo que esta tarea evita.

- [ ] **Paso 3: dejar `Today.tsx` montándolos en el mismo orden**

Mismo orden que hoy: anillo, "Tu semana", "Tu día", "Para ti", "Puedes cocinarlo ya". Los `useMemo` y el estado se quedan en `Today.tsx`.

- [ ] **Paso 4: comprobar que no cambió nada**

Ejecuta: `cd app && npm run lint && npm test && npm run build` — los tres en verde.
Después `git diff --stat`: espera un `Today.tsx` mucho más corto y un `Widgets.tsx` nuevo, **sin cambios en ningún otro fichero**. Si aparece un tercer fichero modificado, revisa por qué.

- [ ] **Paso 5: commit**

```bash
git add app/src/screens/
git commit -F /tmp/msg.txt
```

Mensaje:

```
refactor(today): los bloques de Hoy pasan a componentes de widget

Preparación de la rejilla del dashboard: cada bloque sale a
`screens/today/Widgets.tsx` como componente de presentación que recibe
por props lo que pinta, sin leer el contexto por su cuenta. Ni una cadena
ni un estilo cambian.

De paso, la baldosa de receta de "Para ti" y "Puedes cocinarlo ya", que
estaba duplicada palabra por palabra, pasa a ser una sola.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 5: los cuatro widgets nuevos

**Modelo:** Sonnet. Tres de los cuatro necesitan decidir qué datos enseñan.

**Ficheros:**
- Modificar: `app/src/screens/today/Widgets.tsx`, `app/src/screens/Today.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

**Interfaces:**
- Consume de la Tarea 4: `WidgetCard`, `RecipeTile`.
- Produce (los usa la Tarea 6): `QuickLogWidget`, `ExpiringSoonWidget`, `ShoppingSummaryWidget`, `WhoseTurnWidget`.

**Regla que gobierna los cuatro:** ninguno calcula nada por su cuenta. Los números salen de `domain/` o de datos que ya existen:
- caduca pronto → `PantryItem.expiresInDays` (ya existe en `types.ts`), los que tengan `expiresInDays !== null && expiresInDays <= 7`, ordenados ascendente;
- falta para la semana → `shoppingNeeds` de `domain/shopping.ts`;
- registro rápido → `frequentExtrasOf` de `domain/intake.ts` (el store ya expone `frequentExtras`);
- a quién le toca → `cookMemberId` de las comidas de hoy, ya cargado en el plan.

- [ ] **Paso 1: cadenas nuevas, en los dos idiomas**

En `src/i18n/es.ts`, junto a las demás de Hoy:

```ts
  widgetQuickLog: 'Registro rápido',
  widgetQuickLogEmpty: 'Lo que registres a menudo aparecerá aquí.',
  widgetExpiring: 'Caduca pronto',
  widgetExpiringEmpty: 'Nada a punto de caducar.',
  widgetExpiringIn: (d: number) =>
    d < 0 ? 'Caducado' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`,
  widgetShopping: 'Para la semana',
  widgetShoppingCount: (n: number) => (n === 1 ? 'Falta 1 cosa' : `Faltan ${n} cosas`),
  widgetShoppingEmpty: 'No falta nada.',
  widgetWhoseTurn: 'A quién le toca',
  widgetWhoseTurnNobody: 'Nadie asignado hoy',
  widgetCustomize: 'Personalizar',
```

En `src/i18n/en.ts`:

```ts
  widgetQuickLog: 'Quick log',
  widgetQuickLogEmpty: 'What you log often will show up here.',
  widgetExpiring: 'Expiring soon',
  widgetExpiringEmpty: 'Nothing about to expire.',
  widgetExpiringIn: (d: number) =>
    d < 0 ? 'Expired' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`,
  widgetShopping: 'For the week',
  widgetShoppingCount: (n: number) => (n === 1 ? '1 item missing' : `${n} items missing`),
  widgetShoppingEmpty: 'Nothing missing.',
  widgetWhoseTurn: 'Whose turn',
  widgetWhoseTurnNobody: 'Nobody assigned today',
  widgetCustomize: 'Customize',
```

- [ ] **Paso 2: `QuickLogWidget`**

Props `{ extras: FrequentExtra[]; onLog: (extra: FrequentExtra) => void; label: string; emptyLabel: string }`. Hasta cuatro chips (`Chip` de `src/ui/`), cada uno con etiqueta y kcal; al tocarlo registra ese extra hoy, **sin abrir la hoja**, y avisa con un toast. Lista vacía → el texto de vacío, no un widget en blanco.

`Today.tsx` le pasa `frequentExtras` (ya lo tiene del store) y un `onLog` que llama a `addExtra` con la etiqueta y las kcal del favorito. La llamada va con `await` y `catch` que avise del fallo: un registro que falla en silencio deja el anillo mintiendo el resto del día.

- [ ] **Paso 3: `ExpiringSoonWidget`**

Props `{ items: { id: string; name: string; days: number }[]; onOpenPantry: () => void; label: string; emptyLabel: string; formatDays: (d: number) => string }`. Hasta cinco filas: nombre a la izquierda, plazo a la derecha. **Plazo negativo o cero va en `--warn-ink`, el resto en `--muted`** — `--warn` es relleno, `--warn-ink` es el texto; mezclarlos rompe el contraste.

`Today.tsx` construye la lista desde la despensa, resolviendo el nombre por el catálogo de ingredientes.

- [ ] **Paso 4: `ShoppingSummaryWidget`**

Props `{ count: number; onOpenShopping: () => void; label: string; countLabel: (n: number) => string; emptyLabel: string }`. Una línea con el número y un chevron; al tocar abre la hoja de la compra. El número sale de `shoppingNeeds` con los mismos argumentos que usa hoy la hoja de compra — **no** de un recuento inventado en la pantalla.

- [ ] **Paso 5: `WhoseTurnWidget`**

Props `{ rows: { slot: MealSlot; recipeName: string; member: Member | null }[]; nobodyLabel: string; label: string }`. Una fila por comida de hoy: avatar + nombre de quien cocina (o el texto de "nadie"), y el nombre del plato. Reutiliza `Avatar`. Solo se monta si los turnos están encendidos; la Tarea 1 ya garantiza que con los turnos apagados el widget no está en el layout, así que aquí **no** hace falta un segundo `if`.

- [ ] **Paso 6: comprobar**

Ejecuta: `cd app && npm run lint && npm test && npm run build`.
Los cuatro widgets todavía no tienen sitio en la rejilla (es la Tarea 6): móntalos al final de `Today.tsx` para ver que compilan y déjalos montados — la Tarea 6 los recolocará.

- [ ] **Paso 7: commit**

```bash
git add app/src/screens/ app/src/i18n/
git commit -F /tmp/msg.txt
```

Mensaje:

```
feat(today): registro rápido, caduca pronto, para la semana y a quién le toca

Los cuatro widgets que el catálogo §7.1 pedía y la pantalla no tenía.
Ninguno calcula nada: las kcal salen de `domain/intake.ts`, lo que falta
de `shoppingNeeds`, el plazo de caducidad de `PantryItem.expiresInDays` y
el turno del `cookMemberId` del plan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 6: la rejilla

**Modelo:** Sonnet.

**Ficheros:**
- Modificar: `app/src/screens/Today.tsx`, `app/src/hooks/useMediaQuery.ts`, `app/src/domain/__tests__/dashboard.test.ts`

**Interfaces:**
- Consume: `dashboardLayout` (Tarea 3), `visibleWidgets` / `columnsFor` / `spanFor` (Tarea 1), los nueve componentes (Tareas 4 y 5).
- Produce: nada que consuma otra tarea. Es la pantalla.

- [ ] **Paso 1: `useIsMedium`**

Al final de `app/src/hooks/useMediaQuery.ts`:

```ts
/** Dos columnas en el dashboard (§7.2). Por debajo, una sola. */
export const useIsMedium = () => useMediaQuery('(min-width: 600px)');
```

- [ ] **Paso 2: pintar por layout**

En `Today.tsx`, sustituye la lista fija de widgets por:

```tsx
  const columns = columnsFor(useIsMedium(), isWide);
  const visible = useMemo(() => visibleWidgets(dashboardLayout), [dashboardLayout]);

  // …

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 16,
          alignItems: 'start',
        }}
      >
        {visible.map((item) => (
          <div key={item.id} style={{ gridColumn: `span ${spanFor(item.w, columns)}`, minWidth: 0 }}>
            {renderWidget(item)}
          </div>
        ))}
      </div>
```

`renderWidget` es un `switch` exhaustivo sobre `item.id` que devuelve el componente con sus props. **Que sea exhaustivo importa:** añade `default: { const _never: never = item.id; return null; }`, para que el día que alguien meta un widget en el catálogo y se olvide de pintarlo lo diga `tsc` y no una pantalla a medias.

`minWidth: 0` en el envoltorio no es decorativo: sin él, un nombre de receta largo estira la columna de la rejilla en vez de recortarse con la elipsis que los widgets ya tienen.

- [ ] **Paso 3: comprobar el orden en una columna**

Añade a `app/src/domain/__tests__/dashboard.test.ts`:

```ts
it('el orden no depende de las columnas: en móvil el tamaño no se nota, el orden sí', () => {
  const layout: WidgetItem[] = [
    { id: 'kcal_ring', w: 'half', on: true },
    { id: 'today_meals', w: 'full', on: true },
    { id: 'quick_log', w: 'half', on: true },
  ];
  const ids = layout.map((i) => i.id);
  for (const cols of [1, 2, 3] as const) {
    expect(visibleWidgets(layout).map((i) => i.id)).toEqual(ids);
    expect(spanFor(layout[1].w, cols)).toBe(cols === 1 ? 1 : 2);
  }
});
```

- [ ] **Paso 4: verde**

Ejecuta: `cd app && npm run lint && npm test && npm run build`.

- [ ] **Paso 5: commit**

```bash
git add app/src/screens/Today.tsx app/src/hooks/useMediaQuery.ts app/src/domain/__tests__/dashboard.test.ts
git commit -F /tmp/msg.txt
```

Mensaje:

```
feat(today): Hoy se pinta desde el layout del miembro

La pantalla deja de ser una lista fija de bloques: recorre el layout
normalizado y coloca cada widget con su tamaño. Una columna por debajo de
600px, dos hasta 900, tres por encima, y `full` nunca pasa de dos.

El `switch` que elige componente es exhaustivo a propósito: añadir un
widget al catálogo sin pintarlo tiene que romper `tsc`, no la pantalla.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 7: modo "Personalizar" (sin arrastre)

**Modelo:** Sonnet.

**Ficheros:**
- Crear: `app/src/sheets/DashboardEditSheet.tsx`
- Modificar: `app/src/App.tsx`, `app/src/screens/Today.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

**Interfaces:**
- Consume: `dashboardLayout`, `setDashboardLayout`, `moveWidget`, `setWidgetSize`, `setWidgetOn`, `normalizeLayout`, `WIDGET_CATALOG`.
- Produce: la hoja. La Tarea 8 le añade el arrastre.

Esta tarea entrega la personalización **completa y usable solo con teclado**. El arrastre de la Tarea 8 es un añadido, no el camino principal: un dashboard que solo se ordena arrastrando es un dashboard que parte del hogar no puede ordenar.

- [ ] **Paso 1: cadenas**

En `src/i18n/es.ts`:

```ts
  dashboardTitle: 'Personalizar Hoy',
  dashboardHint: 'Enciende lo que quieras ver y ponlo en el orden que prefieras.',
  dashboardUp: (name: string) => `Subir ${name}`,
  dashboardDown: (name: string) => `Bajar ${name}`,
  dashboardShow: (name: string) => `Mostrar ${name}`,
  dashboardSizeFull: 'Ancho',
  dashboardSizeHalf: 'Media',
  dashboardMoved: (name: string, pos: number, total: number) =>
    `${name}, posición ${pos} de ${total}`,
  dashboardReset: 'Volver al orden inicial',
  widgetName: {
    kcal_ring: 'Tu anillo',
    today_meals: 'Tu día',
    quick_log: 'Registro rápido',
    week_progress: 'Tu semana',
    cookable_now: 'Puedes cocinarlo ya',
    expiring_soon: 'Caduca pronto',
    shopping_summary: 'Para la semana',
    for_you: 'Para ti',
    whose_turn: 'A quién le toca',
  },
```

En `src/i18n/en.ts`, los equivalentes: `Customize Today`, `Turn on what you want to see and put it in the order you like.`, `Move <name> up`, `Move <name> down`, `Show <name>`, `Wide`, `Half`, `<name>, position <p> of <t>`, `Back to the original order`, y los nombres `Your ring`, `Your day`, `Quick log`, `Your week`, `Ready to cook`, `Expiring soon`, `For the week`, `For you`, `Whose turn`.

- [ ] **Paso 2: la hoja**

`DashboardEditSheet({ open, onClose })`. Usa `Sheet` de `src/ui/`, como las demás hojas.

Estado local: una copia del layout (`useState(() => dashboardLayout)`), **no** escritura directa en cada toque. Se guarda al cerrar, con un solo `setDashboardLayout`. Motivo: reordenar son muchos toques seguidos, y una escritura por toque es una ráfaga de round-trips que además puede llegar desordenada.

Una fila por elemento del layout, en orden, cada una con:
- el nombre del widget (`t.widgetName[item.id]`),
- un interruptor de encendido (`CheckRow`/`Switch` de `src/ui/`, `ariaLabel` = `t.dashboardShow(nombre)`),
- si admite dos tamaños, un segmentado Ancho/Media (si solo admite uno, no se pinta el control),
- dos `IconButton` de subir y bajar, `size={height.touch}`, con `ariaLabel` `t.dashboardUp(nombre)` / `t.dashboardDown(nombre)`, y `disabled` en los extremos.

Un `aria-live="polite"` al final de la hoja con el último movimiento anunciado (`t.dashboardMoved(nombre, i + 1, total)`): sin él, quien navega con lector de pantalla no sabe si el botón hizo algo.

Un botón al final, "Volver al orden inicial", que pone `normalizeLayout(null, availability)` — que es exactamente el layout por defecto ya filtrado por disponibilidad — en vez de reimplementar el filtro.

- [ ] **Paso 3: la entrada**

En la cabecera de Hoy, junto al botón de ajustes: un `IconButton` con `ariaLabel={t.widgetCustomize}`. El de ajustes solo se pinta en pantalla estrecha (`!isWide`), pero **el de personalizar se pinta siempre**: en ancho es donde más se nota el orden.

`App.tsx` añade `{ kind: 'dashboardEdit' }` a la unión de hojas y lo monta como las demás.

- [ ] **Paso 4: comprobar**

Ejecuta: `cd app && npm run lint && npm test && npm run build`.

- [ ] **Paso 5: commit**

```bash
git add app/src/sheets/ app/src/App.tsx app/src/screens/Today.tsx app/src/i18n/
git commit -F /tmp/msg.txt
```

Mensaje:

```
feat(today): hoja para personalizar el dashboard

Encender, apagar, cambiar de tamaño y reordenar, todo con teclado y con
lo que se mueve anunciado por `aria-live`. El arrastre llega después y
como añadido: un dashboard que solo se ordena arrastrando es un dashboard
que parte del hogar no puede ordenar.

El layout se edita en una copia local y se guarda una sola vez al cerrar:
reordenar son muchos toques seguidos y una escritura por toque es una
ráfaga de round-trips que además puede llegar desordenada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 8: arrastrar para reordenar

**Modelo:** Sonnet.

**Ficheros:**
- Crear: `app/src/motion/useListReorder.ts`
- Modificar: `app/src/sheets/DashboardEditSheet.tsx`

**Interfaces:**
- Consume: `moveWidget` (Tarea 1), la hoja (Tarea 7), las constantes de muelle de `src/motion/motion.ts`.
- Produce: `useListReorder({ count, itemHeight, onMove })` → `{ dragIndex, offset, handlers(index) }`.

**Por qué código nuevo y no `useSlotDrag`:** `app/src/motion/useSlotDrag.ts` es un gesto de *soltar sobre un `data-slot`* (arrastrar una receta al plan). Una lista reordenable necesita reflujo de los vecinos mientras arrastras. Sirve de referencia para la física —muelles, proyección de inercia— pero no se reutiliza tal cual.

- [ ] **Paso 1: el hook**

Filas de altura fija (fíjala en una constante del propio fichero y úsala también en el estilo de la fila, para que no puedan divergir). Al arrastrar: la fila activa sigue al puntero con `transform`, los vecinos se desplazan una altura con transición, y al soltar se llama `onMove(from, to)`. Punteros unificados (`onPointerDown`/`onPointerMove`/`onPointerUp` + `setPointerCapture`), nunca eventos de ratón y táctiles por separado.

- [ ] **Paso 2: engancharlo al asa**

El asa es un elemento propio dentro de la fila (icono de agarre), no la fila entera: si toda la fila arrastra, no se puede desplazar la lista con el dedo. El asa lleva `aria-hidden` — su función ya la cubren los botones de subir y bajar, y anunciarla dos veces solo estorba.

`onMove(from, to)` se traduce a llamadas de `moveWidget` sobre la copia local, y anuncia por el mismo `aria-live` de la Tarea 7.

- [ ] **Paso 3: comprobar**

Ejecuta: `cd app && npm run lint && npm test && npm run build`.

Sin infraestructura de tests de React en el repo, el gesto no se puede cubrir automáticamente. **Anótalo en el informe de la tarea** para que entre en el documento de pendientes.

- [ ] **Paso 4: commit**

```bash
git add app/src/motion/useListReorder.ts app/src/sheets/DashboardEditSheet.tsx
git commit -F /tmp/msg.txt
```

Mensaje:

```
feat(motion): arrastrar para reordenar el dashboard

`useSlotDrag` es soltar sobre un destino, no reordenar con reflujo, así
que el gesto es nuevo; la física sale de las mismas constantes de muelle.

El asa arrastra, no la fila entera: con la fila entera no se podría
desplazar la lista con el dedo. Va `aria-hidden` porque subir y bajar ya
están como botones.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Tarea 9: cerrar la fase

**Modelo:** Sonnet.

**Ficheros:**
- Modificar: `CLAUDE.md`, `CHANGELOG.md`, `app/package.json`, `mcp/package.json` (+ los dos lockfiles, vía el script)

- [ ] **Paso 1: subir versión**

Ejecuta: `cd /home/jars/Programing/Rezet && node tools/release/bump-version.mjs minor`
Es `minor`: hay funcionalidad nueva y ningún cambio incompatible.

- [ ] **Paso 2: entrada bilingüe en `CHANGELOG.md`**

Mismo formato exacto que la de 1.11.0 (`## [x.y.z] - fecha`, `### Español` / `### English`, `**Nuevo**`). Di con todas las letras, en los dos idiomas:
- que Hoy ahora se configura por persona y que esa configuración te sigue al segundo dispositivo;
- que se puede apagar cualquier widget, incluido el anillo;
- que "a quién le toca" solo existe con los turnos encendidos;
- que se ordena arrastrando **o** con los botones de subir y bajar.

- [ ] **Paso 3: `CLAUDE.md`**

- En el mapa de `src/`, añade `domain/dashboard.ts` a la lista de reglas puras.
- En las reglas no negociables, una línea: **el layout del dashboard se normaliza siempre antes de pintar (`normalizeLayout`), y esa función no lanza nunca** — un layout guardado por otra versión tiene que dar el layout por defecto, no una pantalla en blanco al abrir la app. Con la razón por la que un widget apagado se guarda con `on: false` en vez de borrarse.
- En "Already done", cierra la fase 3 citando este plan.

- [ ] **Paso 4: verde y commit de release**

Ejecuta: `cd app && npm run lint && npm test && npm run build`.
Después, desde la raíz: `git add -A` y un commit `Release X.Y.Z` terminado con la línea `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

- [ ] **Paso 5: NO desplegar**

Desplegar es decisión del dueño del repo y pasa por la skill `deploying-to-main`, con su confirmación para ese commit exacto. **Ningún agente hace `git push`.**

---

## Lo que esta fase deja pendiente de una persona

Nadie puede abrir esto en un navegador salvo el dueño del repo. Lo primero que miraría, por orden:

1. Apagar el anillo y recargar: tiene que seguir apagado, y **no** volver a aparecer como si fuera un widget nuevo.
2. Reordenar arrastrando en un móvil de verdad, comprobando que la lista todavía se puede desplazar con el dedo.
3. Encender los turnos en Ajustes y volver a Hoy: "a quién le toca" tiene que aparecer, y desaparecer al apagarlos.
4. Estrechar la ventana de 1200 a 500px y ver que el orden no cambia en ningún punto.
