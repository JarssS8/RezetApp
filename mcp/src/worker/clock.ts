import { setClock } from '../../../app/src/domain/dates';

/** Date whose UTC fields equal the wall-clock fields in `timeZone` (Workers are UTC-only). */
export function zonedNow(timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
}

let installed: string | undefined;

export function installClock(timeZone: string): void {
  if (installed !== timeZone) {
    setClock(() => zonedNow(timeZone));
    installed = timeZone;
  }
}
