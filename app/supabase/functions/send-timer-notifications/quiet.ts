// Diseño §9 — horas de silencio: la franja del día en la que un miembro no
// quiere que le lleguen avisos. Vive aparte del cuerpo de la Edge Function
// porque decidir si una hora cae dentro de una franja que puede cruzar la
// medianoche (23:00 a 08:00) es justo el tipo de cálculo con casos límite
// que conviene tener aislado y con sus propios tests, no enredado en un
// manejador HTTP.
//
// Importante: esta función NO se aplica a los temporizadores de cocina — esa
// decisión de producto vive en `member_notify_pref` (columna `timers`,
// exenta por diseño) y en quien llama a `isQuiet` desde `index.ts`, nunca
// aquí. Este módulo es genérico para el resto de avisos (expiring, cook_turn,
// log_reminder).

/** Minutos desde medianoche de un `time` de Postgres ("HH:MM" o "HH:MM:SS"). */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Zona horaria del hogar. Las Edge Functions corren en UTC, así que
 * `getHours()` daría las 22:30 de Madrid como 20:30 y una franja de 23:00 a
 * 08:00 se aplicaría con dos horas de desfase — justo en la franja en la que
 * la gente duerme. Es el mismo motivo por el que el Worker de MCP llama a
 * `setClock`.
 */
export const HOUSEHOLD_TIME_ZONE = "Europe/Madrid";

/** Minutos desde medianoche de `at`, leídos en la zona horaria dada. */
export function localMinutes(at: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // `en-GB` con hour12:false da 24 en vez de 0 para la medianoche en algunos
  // motores; normalizarlo es más barato que confiar en que no pase.
  return (hour % 24) * 60 + minute;
}

/**
 * ¿Cae `now` dentro de la franja de silencio [from, to)?
 *
 * - Sin `from` o sin `to`: no hay franja configurada, nunca hay silencio.
 * - `from < to`: franja normal dentro del mismo día (ej. 22:00-23:00).
 * - `from > to`: franja que cruza la medianoche (ej. 23:00-08:00) — el
 *   silencio son las horas DESDE `from` hasta medianoche MÁS las horas desde
 *   medianoche HASTA `to`.
 * - `from === to`: franja degenerada (0 minutos de silencio); se trata como
 *   "no hay franja" en vez de "silencio las 24 horas", porque un usuario que
 *   pone la misma hora en los dos campos con toda probabilidad no ha querido
 *   silenciar el día entero.
 *
 * Borde elegido y fijado por test: el instante `from` SÍ es silencio (la
 * franja empieza a esa hora en punto), el instante `to` NO lo es (la franja
 * termina justo ahí, es la hora en la que ya se puede volver a avisar) — de
 * ahí el intervalo semiabierto [from, to).
 */
export function isQuiet(
  now: Date,
  from: string | null,
  to: string | null,
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): boolean {
  if (!from || !to) return false;

  const start = minutesOf(from);
  const end = minutesOf(to);
  if (start === end) return false;

  // En la zona del hogar, nunca en la del proceso: ver `localMinutes`.
  const nowMinutes = localMinutes(now, timeZone);

  if (start < end) {
    // Franja normal: silencio solo entre las dos horas del mismo día.
    return nowMinutes >= start && nowMinutes < end;
  }

  // Franja que cruza la medianoche: silencio antes de `to` (ya entrada la
  // madrugada) o a partir de `from` (ya entrada la noche).
  return nowMinutes >= start || nowMinutes < end;
}
