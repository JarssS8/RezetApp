// Diseño §9 — igual que `quiet.ts` en `send-timer-notifications`, la
// decisión de "¿toca este aviso a esta hora para este miembro?" vive aparte
// del manejador HTTP: es TypeScript puro (sin red, sin API de Deno), así que
// se puede testear con vitest sin arrancar nada.
//
// Los tres avisos que decide esta función (`expiring`, `cook_turn`,
// `log_reminder`) SÍ respetan las horas de silencio — a diferencia de
// `timers`, que ni siquiera pasa por aquí (ver `send-timer-notifications`).
import { HOUSEHOLD_TIME_ZONE, isQuiet, localMinutes } from '../send-timer-notifications/quiet.ts';

/** Hora de Madrid a la que se comprueban `expiring` y `cook_turn` (diseño §9). */
export const MORNING_HOUR = 9;

/**
 * Horas que sigue valiendo un aviso que no salió a su hora.
 *
 * Sin esto, la puerta era `hora === HORA_EXACTA` y cualquier pasada perdida
 * —el cron caído, o el tope de envíos por pasada alcanzado— se comía el
 * aviso para todo el día, sin fila en `member_notice_log` y sin traza. Con
 * la ventana, la pasada siguiente lo recoge; el registro de avisos enviados
 * sigue impidiendo que salga dos veces. Tres horas y no más: un "hoy
 * cocinas tú" a las 13:00 todavía sirve, a las 20:00 ya no.
 */
export const CATCH_UP_HOURS = 3;

/** ¿Estamos en la ventana que abre a `startHour` y dura `CATCH_UP_HOURS`? */
function inWindow(hour: number, startHour: number): boolean {
  return hour >= startHour && hour < startHour + CATCH_UP_HOURS;
}

/**
 * Forma de una fila de `member_notify_pref`, tal como la devuelve el embed
 * de PostgREST (columnas en snake_case, `time` como string `'HH:MM'` o
 * `'HH:MM:SS'`). Solo las columnas que este aviso necesita.
 */
export interface NotifyPrefRow {
  expiring: boolean;
  cook_turn: boolean;
  log_reminder: boolean;
  log_reminder_at: string;
  quiet_from: string | null;
  quiet_to: string | null;
}

/**
 * Valores por defecto de la migración `20260921100000_rezet_notify_pref.sql`.
 * Un miembro sin fila en `member_notify_pref` (nadie ha tocado el ajuste
 * todavía) se comporta EXACTAMENTE como si tuviera esta fila — nunca como
 * "todo apagado" ni como "todo encendido a la fuerza".
 */
export const DEFAULT_NOTIFY_PREF: NotifyPrefRow = {
  expiring: true,
  cook_turn: true,
  log_reminder: false,
  log_reminder_at: '21:00',
  quiet_from: null,
  quiet_to: null,
};

function hourOf(hhmm: string): number {
  return Number(hhmm.split(':')[0]);
}

/** Clave de un reparto concreto: esta persona, esta comida del plan. */
export function shareKey(memberId: string, planEntryId: string): string {
  return memberId + '|' + planEntryId;
}

/**
 * Comio esta persona de alguna de las comidas cocinadas hoy en su hogar?
 *
 * La regla que importa, y que ya se escribio mal una vez: **la racion por
 * defecto es implicita**. `finish_cook_v2` no escribe fila en `intake_share`
 * cuando nadie toca el reparto al terminar de cocinar, que es el caso
 * normal, y `domain/intake.ts` cuenta esa comida igual (`DEFAULT_SHARE = 1`).
 * Asi que "sin fila" es "comio una racion", no "no comio". Solo una fila con
 * 0 -el "No lo comi" explicito- significa que no comio de ese plato.
 *
 * Con la lectura contraria, en un hogar que cena en casa todos los dias el
 * recordatorio de registrar saltaba para todo el mundo cada noche, diciendo
 * lo contrario de lo que la pantalla de Hoy les acababa de ensenar.
 */
export function ateFromCooked(
  memberId: string,
  cookedEntryIdsToday: readonly string[],
  explicitShares: ReadonlyMap<string, number>,
): boolean {
  return cookedEntryIdsToday.some((entryId) => {
    const explicit = explicitShares.get(shareKey(memberId, entryId));
    return explicit === undefined ? true : explicit > 0;
  });
}

export interface DueInputs {
  /** El instante de esta pasada del cron. */
  now: Date;
  /** `null` cuando el miembro no tiene fila en `member_notify_pref` todavía. */
  pref: NotifyPrefRow | null;
  /** `household.turns_enabled` del hogar de este miembro. */
  turnsEnabled: boolean;
  /** ¿Hay algo en la despensa del hogar que caduque hoy o en los próximos 3 días? */
  hasExpiringSoon: boolean;
  /** ¿Hay una `plan_entry` de hoy con `cook_member_id` igual a este miembro? */
  isCookToday: boolean;
  /**
   * ¿Ha comido ESTA PERSONA algo que la app ya cuente hoy? Un extra propio,
   * o su ración de una comida cocinada hoy.
   *
   * Dos cosas que hay que saber para calcularlo bien, y que ya han fallado
   * una vez cada una:
   *
   * - Es por miembro, no por hogar. Que alguien cocinara en casa no dice
   *   nada de si tú comiste, y mirarlo a nivel de hogar dejaba el
   *   recordatorio sin saltar casi nunca justo para quien no se apunta nada.
   * - **La ración por defecto es implícita.** `finish_cook_v2` no escribe
   *   fila en `intake_share` cuando nadie toca el reparto, y `domain/intake.ts`
   *   cuenta esa comida igual (`DEFAULT_SHARE = 1`). Así que "sin fila"
   *   significa "comió una ración", no "no comió". Solo una fila con 0 —el
   *   "No lo comí" explícito— es no haber comido.
   */
  hasLoggedToday: boolean;
  /** Solo para tests: forzar una zona horaria distinta a Madrid. */
  timeZone?: string;
}

export interface DueNotices {
  expiring: boolean;
  cookTurn: boolean;
  logReminder: boolean;
}

/** ¿Qué avisos tocan AHORA MISMO para este miembro? Sin efectos, sin red. */
export function dueNotices(inputs: DueInputs): DueNotices {
  const timeZone = inputs.timeZone ?? HOUSEHOLD_TIME_ZONE;
  const pref = inputs.pref ?? DEFAULT_NOTIFY_PREF;
  const hour = Math.floor(localMinutes(inputs.now, timeZone) / 60);
  const quiet = isQuiet(inputs.now, pref.quiet_from, pref.quiet_to, timeZone);

  return {
    expiring: !quiet && pref.expiring && inWindow(hour, MORNING_HOUR) && inputs.hasExpiringSoon,
    cookTurn:
      !quiet && pref.cook_turn && inWindow(hour, MORNING_HOUR) && inputs.turnsEnabled && inputs.isCookToday,
    logReminder:
      !quiet && pref.log_reminder && inWindow(hour, hourOf(pref.log_reminder_at)) && !inputs.hasLoggedToday,
  };
}
