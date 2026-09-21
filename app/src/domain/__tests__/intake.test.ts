import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE,
  EXTRA_KCAL_MAX,
  EXTRA_KCAL_MIN,
  SPLIT_SHARE_MAX,
  dayBand,
  frequentExtrasOf,
  intakeOfDay,
  splitServings,
  streakOf,
  weekAverage,
  weekTotals,
} from '../intake';
import { asMemberId, type IntakeExtra, type PlanEntry, type Recipe } from '../../types';

const receta = (id: string, kcal: number): Recipe =>
  ({ id, kcalPerServing: kcal, name: { es: id, en: id } } as unknown as Recipe);

const entrada = (id: string, recipeId: string, servings: number, cooked: boolean): PlanEntry =>
  ({ id, date: '2026-09-21', slot: 'lunch', recipeId, servings, cooked } as PlanEntry);

const recipes = new Map<string, Recipe>([
  ['r1', receta('r1', 500)],
  ['r2', receta('r2', 300)],
]);

describe('intake', () => {
  it('una comida cocinada cuenta UNA ración, no las del plato', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 4, true)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(500);
    expect(DEFAULT_SHARE).toBe(1);
  });

  it('lo planificado sin cocinar no cuenta para nadie', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, false)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(0);
    expect(d.planned).toBe(500);
  });

  it('la excepción manda sobre el valor por defecto', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, true)],
      recipeById: recipes,
      shares: new Map([['p1', 1.5]]),
      extras: [],
    });
    expect(d.done).toBe(750);
  });

  it('cero raciones significa "no lo comí"', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, true)],
      recipeById: recipes,
      shares: new Map([['p1', 0]]),
      extras: [],
    });
    expect(d.done).toBe(0);
    expect(d.meals[0]?.share).toBe(0);
  });

  it('los extras suman y son independientes del plan', () => {
    const d = intakeOfDay({
      entries: [],
      recipeById: recipes,
      shares: new Map(),
      extras: [{ id: 'e1', label: 'Café', kcal: 90 }, { id: 'e2', label: 'Cerveza', kcal: 150 }],
    });
    expect(d.extras).toBe(240);
    expect(d.done).toBe(240);
  });

  it('extraLines refleja lo que entró y suma lo mismo que extras', () => {
    const lineas = [
      { id: 'e1', label: 'Café', kcal: 90 },
      { id: 'e2', label: 'Cerveza', kcal: 150 },
    ];
    const d = intakeOfDay({
      entries: [],
      recipeById: recipes,
      shares: new Map(),
      extras: lineas,
    });
    expect(d.extraLines).toEqual(lineas);
    expect(d.extraLines.reduce((sum, x) => sum + x.kcal, 0)).toBe(d.extras);
  });

  it('una receta que ya no existe no rompe el día', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'fantasma', 2, true)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(0);
  });

  it('la semana devuelve un total por día, incluidos los vacíos', () => {
    const totals = weekTotals({
      dates: ['2026-09-21', '2026-09-22'],
      entriesByDate: new Map([['2026-09-21', [entrada('p1', 'r2', 1, true)]]]),
      recipeById: recipes,
      shares: new Map(),
      extrasByDate: new Map(),
    });
    expect(totals).toEqual([
      { date: '2026-09-21', kcal: 300 },
      { date: '2026-09-22', kcal: 0 },
    ]);
  });

  it('la racha solo cuenta días pasados y completos', () => {
    const dias: { date: string; kcal: number }[] = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 1850 },
      { date: '2026-09-20', kcal: 2000 },
      { date: '2026-09-21', kcal: 200 }, // hoy, a medias: no debe cortar la racha
    ];
    expect(streakOf(dias, 1900, '2026-09-21')).toBe(3);
  });

  it('un día fuera de la banda corta la racha', () => {
    const dias = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 3000 },
      { date: '2026-09-20', kcal: 1900 },
    ];
    expect(streakOf(dias, 1900, '2026-09-21')).toBe(1);
  });

  it('sin objetivo no hay racha que calcular', () => {
    expect(streakOf([{ date: '2026-09-20', kcal: 1900 }], 0, '2026-09-21')).toBe(0);
  });

  it('dayBand: dentro, por encima y por debajo usan la misma banda que la racha', () => {
    expect(dayBand(1900, 1900)).toBe('within');
    expect(dayBand(2050, 1900)).toBe('within'); // dentro del 10%
    expect(dayBand(3000, 1900)).toBe('over');
    expect(dayBand(200, 1900)).toBe('under');
  });

  it('dayBand: sin objetivo, ningún día queda "dentro"', () => {
    expect(dayBand(0, 0)).toBe('under');
  });

  it('dayBand: el borde exacto de la banda (±10%) cuenta como "dentro"', () => {
    // La banda es <=, no <: fijar aquí el borde para que si algún día cambia
    // la constante (o el operador) un test se rompa en vez de que el gráfico
    // cambie de color en silencio.
    expect(dayBand(1900 * 1.1, 1900)).toBe('within');
    expect(dayBand(1900 * 0.9, 1900)).toBe('within');
  });

  it('weekAverage: solo promedia los días ya terminados, no el de hoy', () => {
    const dias = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 2100 },
      { date: '2026-09-21', kcal: 200 }, // hoy, a medias: no debe entrar en la media
    ];
    expect(weekAverage(dias, '2026-09-21')).toBe(2000);
  });

  it('weekAverage: sin días terminados todavía, la media es 0', () => {
    expect(weekAverage([{ date: '2026-09-21', kcal: 900 }], '2026-09-21')).toBe(0);
  });

  // Hallazgo de revisión: el cliente tiene que acotar `kcal` de un extra al
  // MISMO rango que el `check` de `intake_extra.kcal` en la base
  // (`supabase/migrations/20260921090100_rezet_intake.sql`) — fijado aquí
  // para que un cambio en un lado sin el otro rompa este test en vez de
  // dejar que la real rechace en crudo lo que la demo se traga tan tranquila.
  it('EXTRA_KCAL_MIN/MAX coinciden con el check de intake_extra.kcal en la base', () => {
    expect(EXTRA_KCAL_MIN).toBe(0);
    expect(EXTRA_KCAL_MAX).toBe(10000);
  });

  describe('splitServings — reparto en un toque de CookFinishSheet', () => {
    it('2 raciones entre 4 personas da 0,5 cada una', () => {
      expect(splitServings(2, 4)).toBe(0.5);
    });

    it('reparto exacto no deja arrastre de coma flotante', () => {
      expect(splitServings(1, 3)).toBe(0.33);
    });

    it('se redondea a dos decimales, lo que acepta la columna', () => {
      expect(splitServings(10, 3)).toBe(3.33);
    });

    it('nunca pasa de SPLIT_SHARE_MAX (6), el tope de la columna', () => {
      expect(splitServings(24, 1)).toBe(SPLIT_SHARE_MAX);
    });

    it('sin nadie marcado no reparte nada, en vez de dividir por cero', () => {
      expect(splitServings(4, 0)).toBe(0);
    });
  });

  describe('frequentExtrasOf — favoritos de IntakeAddSheet', () => {
    const m1 = asMemberId('m1');
    const fila = (memberId: string, label: string, kcal: number, source: IntakeExtra['source']) =>
      ({ memberId: asMemberId(memberId), label, kcal, source }) as Pick<
        IntakeExtra,
        'memberId' | 'label' | 'kcal' | 'source'
      >;

    it('solo cuenta lo registrado a mano, no por receta ni código de barras', () => {
      const rows = [
        fila('m1', 'Yogur', 120, 'manual'),
        fila('m1', 'Yogur', 120, 'manual'),
        fila('m1', 'Tortilla', 400, 'recipe'),
        fila('m1', 'Cerveza', 150, 'barcode'),
      ];
      expect(frequentExtrasOf(m1, rows)).toEqual([{ label: 'Yogur', kcal: 120, times: 2 }]);
    });

    it('no mezcla los extras de otra persona del hogar', () => {
      const rows = [fila('m1', 'Yogur', 120, 'manual'), fila('m2', 'Yogur', 120, 'manual')];
      expect(frequentExtrasOf(m1, rows)).toEqual([{ label: 'Yogur', kcal: 120, times: 1 }]);
    });

    it('agrupa por nombre Y kcal exactos — dos cifras distintas no son "lo mismo"', () => {
      const rows = [fila('m1', 'Café con leche', 50, 'manual'), fila('m1', 'Café con leche', 80, 'manual')];
      expect(frequentExtrasOf(m1, rows)).toHaveLength(2);
    });

    it('ordena por frecuencia y corta en 8', () => {
      const rows = Array.from({ length: 9 }, (_, i) => fila('m1', `Extra ${i}`, 100 + i, 'manual'));
      // El primero se repite tres veces más, así que debe quedar el primero.
      rows.push(fila('m1', 'Extra 0', 100, 'manual'), fila('m1', 'Extra 0', 100, 'manual'));
      const result = frequentExtrasOf(m1, rows);
      expect(result).toHaveLength(8);
      expect(result[0]).toEqual({ label: 'Extra 0', kcal: 100, times: 3 });
    });
  });
});
