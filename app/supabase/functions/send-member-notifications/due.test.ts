// `due.ts` es TypeScript puro (sin ninguna API de Deno), así que se testea
// con vitest como `quiet.test.ts` — `npm test` lo recoge y lo corre en CI.
import { describe, expect, it } from 'vitest';
import { ateFromCooked, DEFAULT_NOTIFY_PREF, dueNotices, shareKey, type NotifyPrefRow } from './due.ts';

/**
 * Un instante que en **Madrid** son las `hour:minute` del 1 de enero de 2026
 * (Madrid en UTC+1 en enero). Construido por UTC, no con componentes
 * locales — igual que `quiet.test.ts` y por el mismo motivo: con
 * componentes locales el test pasaría igual bajo `TZ=UTC` que bajo
 * `TZ=Europe/Madrid`, y no notaría si la función leyera la hora del proceso
 * en vez de la del hogar.
 */
function madrid(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, hour - 1, minute));
}

const allOn: NotifyPrefRow = {
  expiring: true,
  cook_turn: true,
  log_reminder: true,
  log_reminder_at: '21:00',
  quiet_from: null,
  quiet_to: null,
};

const baseInputs = {
  pref: allOn,
  turnsEnabled: true,
  hasExpiringSoon: true,
  isCookToday: true,
  hasLoggedToday: false,
};

describe('dueNotices', () => {
  it('a las 9 toca expiring si hay algo caducando y el interruptor está encendido', () => {
    const due = dueNotices({ ...baseInputs, now: madrid(9, 5) });
    expect(due.expiring).toBe(true);
  });

  it('un aviso de la mañana que no salió a su hora se recoge en las horas siguientes', () => {
    // Ventana de recuperación: el cron caído a las 9, o el tope de envíos
    // alcanzado, no puede comerse el aviso para todo el día. El registro de
    // avisos enviados es lo que impide que salga dos veces.
    for (const hora of [9, 10, 11]) {
      const due = dueNotices({ ...baseInputs, now: madrid(hora, 5) });
      expect(due.expiring).toBe(true);
      expect(due.cookTurn).toBe(true);
    }
  });

  it('pasada la ventana de recuperación ya no toca: a media tarde no sirve de nada', () => {
    for (const hora of [12, 17, 22]) {
      const due = dueNotices({ ...baseInputs, now: madrid(hora, 5) });
      expect(due.expiring).toBe(false);
      expect(due.cookTurn).toBe(false);
    }
  });

  it('antes de su hora no toca', () => {
    const due = dueNotices({ ...baseInputs, now: madrid(8, 5) });
    expect(due.expiring).toBe(false);
    expect(due.cookTurn).toBe(false);
  });

  it('con el interruptor apagado no toca, aunque haya algo caducando', () => {
    const due = dueNotices({
      ...baseInputs,
      now: madrid(9, 5),
      pref: { ...allOn, expiring: false },
    });
    expect(due.expiring).toBe(false);
  });

  it('cook_turn no toca con turns_enabled en false aunque el miembro tenga comida asignada', () => {
    const due = dueNotices({ ...baseInputs, now: madrid(9, 5), turnsEnabled: false });
    expect(due.cookTurn).toBe(false);
  });

  it('log_reminder toca a la hora configurada y no a otra, y no toca si ya registró algo hoy', () => {
    const atConfiguredHour = dueNotices({ ...baseInputs, now: madrid(21, 5) });
    expect(atConfiguredHour.logReminder).toBe(true);

    const atOtherHour = dueNotices({ ...baseInputs, now: madrid(20, 5) });
    expect(atOtherHour.logReminder).toBe(false);

    const alreadyLogged = dueNotices({ ...baseInputs, now: madrid(21, 5), hasLoggedToday: true });
    expect(alreadyLogged.logReminder).toBe(false);
  });

  it('sin fila de preferencias se usan los valores por defecto (log_reminder no toca, apagado por defecto)', () => {
    expect(DEFAULT_NOTIFY_PREF.log_reminder).toBe(false);

    const atDefaultLogReminderHour = dueNotices({ ...baseInputs, pref: null, now: madrid(21, 5) });
    expect(atDefaultLogReminderHour.logReminder).toBe(false);

    // Los otros dos sí siguen encendidos por defecto.
    const atMorning = dueNotices({ ...baseInputs, pref: null, now: madrid(9, 5) });
    expect(atMorning.expiring).toBe(true);
    expect(atMorning.cookTurn).toBe(true);
  });

  it('dentro de la franja de silencio no toca ninguno de los tres', () => {
    const quietPref: NotifyPrefRow = { ...allOn, quiet_from: '00:00', quiet_to: '23:59' };

    const morning = dueNotices({ ...baseInputs, now: madrid(9, 5), pref: quietPref });
    expect(morning.expiring).toBe(false);
    expect(morning.cookTurn).toBe(false);

    const evening = dueNotices({ ...baseInputs, now: madrid(21, 5), pref: quietPref });
    expect(evening.logReminder).toBe(false);
  });

  it('la hora se lee en Madrid y no en UTC', () => {
    // Las 9:05 de Madrid son las 8:05 UTC (enero, Madrid en UTC+1).
    const instant = new Date(Date.UTC(2026, 0, 1, 8, 5));

    const enMadrid = dueNotices({ ...baseInputs, now: instant });
    expect(enMadrid.expiring).toBe(true);

    const enUtc = dueNotices({ ...baseInputs, now: instant, timeZone: 'UTC' });
    expect(enUtc.expiring).toBe(false);
  });
});

describe('ateFromCooked', () => {
  const CENA = 'entry-cena';
  const COMIDA = 'entry-comida';

  it('sin fila de reparto, esa persona comio: la racion por defecto es implicita', () => {
    // `finish_cook_v2` no escribe fila cuando nadie toca el reparto, que es
    // el caso normal, y el anillo de Hoy cuenta esa comida igual. Leerlo al
    // reves hacia saltar el recordatorio cada noche en una casa que cena en
    // casa, diciendo lo contrario de lo que la propia app acababa de
    // ensenar en Hoy.
    expect(ateFromCooked('ana', [CENA], new Map())).toBe(true);
  });

  it('una racion explicita de 0 es "no lo comi", y no cuenta', () => {
    const shares = new Map([[shareKey('ana', CENA), 0]]);
    expect(ateFromCooked('ana', [CENA], shares)).toBe(false);
  });

  it('una racion explicita mayor que cero cuenta', () => {
    const shares = new Map([[shareKey('ana', CENA), 0.5]]);
    expect(ateFromCooked('ana', [CENA], shares)).toBe(true);
  });

  it('basta con haber comido de una de las comidas del dia', () => {
    const shares = new Map([[shareKey('ana', CENA), 0]]);
    expect(ateFromCooked('ana', [COMIDA, CENA], shares)).toBe(true);
  });

  it('el reparto de otra persona no cuenta como el tuyo', () => {
    const shares = new Map([[shareKey('bea', CENA), 0]]);
    expect(ateFromCooked('bea', [CENA], shares)).toBe(false);
    expect(ateFromCooked('ana', [CENA], shares)).toBe(true);
  });

  it('sin nada cocinado hoy, no ha comido nada que la app cuente', () => {
    expect(ateFromCooked('ana', [], new Map())).toBe(false);
  });
});
