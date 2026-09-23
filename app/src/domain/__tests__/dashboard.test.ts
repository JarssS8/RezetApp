import { describe, expect, it } from 'vitest';
import {
  columnsFor,
  DEFAULT_LAYOUT,
  isWidgetEmpty,
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
    expect(out[0]!.id).toBe('kcal_ring');
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
    expect(out[1]!.on).toBe(false);
    expect(visibleWidgets(out).map((i) => i.id)).toEqual(['kcal_ring', 'quick_log']);
  });
});

describe('rejilla', () => {
  // Revisión final de rama, hallazgo Important: la §7.2 pedía tres columnas
  // desde ancho, pero `maxW.today` sigue en 600px — a tres, 189px por
  // columna desborda una baldosa de receta y deja el anillo sin sitio para
  // su propia cifra. `columnsFor` ya no devuelve 3 (ver el comentario en
  // `domain/dashboard.ts`): dos columnas máximo, sea cual sea el ancho.
  it('columnas por ancho: nunca más de dos', () => {
    expect(columnsFor(false)).toBe(1);
    expect(columnsFor(true)).toBe(2);
  });

  it('en una columna todo ocupa uno: el tamaño no se nota, el orden sí', () => {
    expect(spanFor('half', 1)).toBe(1);
    expect(spanFor('full', 1)).toBe(1);
  });

  it('full ocupa las dos columnas de la rejilla media', () => {
    expect(spanFor('full', 2)).toBe(2);
    expect(spanFor('half', 2)).toBe(1);
  });

  it('el orden no depende de las columnas: en móvil el tamaño no se nota, el orden sí', () => {
    const layout: WidgetItem[] = [
      { id: 'kcal_ring', w: 'half', on: true },
      { id: 'today_meals', w: 'full', on: true },
      { id: 'quick_log', w: 'half', on: true },
    ];
    const ids = layout.map((i) => i.id);
    for (const cols of [1, 2] as const) {
      expect(visibleWidgets(layout).map((i) => i.id)).toEqual(ids);
      expect(spanFor(layout[1]!.w, cols)).toBe(cols === 1 ? 1 : 2);
    }
  });
});

describe('isWidgetEmpty', () => {
  // Segunda ronda de revisión final, hallazgo I1 — NOT ADDRESSED la
  // primera vez: `Today.tsx` comprobaba `renderWidget(item) === null`,
  // pero `renderWidget` siempre devuelve un elemento de React (el `return
  // null` vivía dentro del COMPONENTE, no en el `switch`), así que esa
  // comprobación nunca era cierta y la celda de rejilla se seguía
  // pintando vacía. Este test no puede fijar `Today.tsx` en sí — este
  // repo no tiene Testing Library para montar componentes (ver
  // `CLAUDE.md`, "Known gaps") — pero sí fija, barato y sin React, la
  // única pieza de lógica de la que depende el arreglo: el predicado que
  // decide el vacío. `Today.tsx` ahora hace literalmente
  // `if (isWidgetEmpty(id, counts)) return null;` DENTRO de cada `case`
  // del `switch`, antes de construir el elemento — con este predicado ya
  // fijado, esa línea es glue code trivial de inspeccionar a simple
  // vista.
  const NONE = { suggestions: 0, cookable: 0, whoseTurnRows: 0 };
  const SOME = { suggestions: 3, cookable: 2, whoseTurnRows: 1 };

  it('for_you, cookable_now y whose_turn se ocultan sin nada que mostrar', () => {
    expect(isWidgetEmpty('for_you', NONE)).toBe(true);
    expect(isWidgetEmpty('cookable_now', NONE)).toBe(true);
    expect(isWidgetEmpty('whose_turn', NONE)).toBe(true);
  });

  it('for_you, cookable_now y whose_turn se pintan en cuanto tienen algo', () => {
    expect(isWidgetEmpty('for_you', SOME)).toBe(false);
    expect(isWidgetEmpty('cookable_now', SOME)).toBe(false);
    expect(isWidgetEmpty('whose_turn', SOME)).toBe(false);
  });

  it('cada uno mira solo su propio recuento, no los otros dos', () => {
    expect(isWidgetEmpty('for_you', { suggestions: 0, cookable: 5, whoseTurnRows: 5 })).toBe(true);
    expect(isWidgetEmpty('cookable_now', { suggestions: 5, cookable: 0, whoseTurnRows: 5 })).toBe(true);
    expect(isWidgetEmpty('whose_turn', { suggestions: 5, cookable: 5, whoseTurnRows: 0 })).toBe(true);
  });

  it('el resto del catálogo nunca se oculta por esta vía — pintan su propio estado vacío', () => {
    for (const id of ['kcal_ring', 'today_meals', 'week_progress', 'quick_log', 'expiring_soon', 'shopping_summary'] as const) {
      expect(isWidgetEmpty(id, NONE)).toBe(false);
    }
  });
});
