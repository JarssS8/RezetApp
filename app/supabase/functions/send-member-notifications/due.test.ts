// `due.ts` es TypeScript puro (sin ninguna API de Deno), así que se testea
// con vitest como `quiet.test.ts` — `npm test` lo recoge y lo corre en CI.
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_PREF, dueNotices, type NotifyPrefRow } from './due.ts';

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

  it('a las 10 no toca ninguno de los dos de la mañana', () => {
    const due = dueNotices({ ...baseInputs, now: madrid(10, 5) });
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
