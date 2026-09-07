import type { Locale, MealSlot } from '../types';

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

let clockFn: () => Date = () => new Date();
/**
 * Test/Worker hook: override how "now" is read. Default: the runtime's local clock.
 *
 * This is module-level mutable global state, safe today only because every caller in this
 * codebase installs the exact same single timezone value (`REZET_TZ`, one fixed deployment-wide
 * setting — see `mcp/src/worker/clock.ts`'s `installClock`, which is idempotent after the first
 * call per isolate for that reason). It is NOT per-request-safe: if a future feature needs
 * per-household timezones, do not call `setClock` per-request in a shared/concurrent runtime
 * like the Cloudflare Worker without redesigning this (e.g. threading an explicit `now` through
 * call sites instead of a shared global).
 */
export function setClock(fn: () => Date): void {
  clockFn = fn;
}
function now(): Date {
  return clockFn();
}

/** Clave ISO local `YYYY-MM-DD`, estable frente a zonas horarias. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(now());
}

/** Diferencia de días (con signo) entre hoy y `dateStr`. Negativo = ya caducado. */
export function daysUntil(dateStr: string): number {
  const today = new Date(`${todayKey()}T00:00:00`).getTime();
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** `null` si no hay fecha; si no, `daysUntil`. Punto único para "fecha real → días relativos". */
export function resolveExpiry(dateStr: string | null): number | null {
  return dateStr ? daysUntil(dateStr) : null;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

export function offsetKey(days: number): string {
  return dateKey(addDays(now(), days));
}

/** Lunes de la semana, con desplazamiento en semanas. */
export function mondayOf(weekOffset: number): Date {
  const d = now();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
  return d;
}

export function weekDays(weekOffset: number): Date[] {
  const monday = mondayOf(weekOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const intl = (locale: Locale) => (locale === 'es' ? 'es-ES' : 'en-US');

export function longDate(d: Date, locale: Locale): string {
  return d.toLocaleDateString(intl(locale), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "12 de septiembre" — resumen corto para una fecha ya elegida (sin año, sin día de la semana). */
export function shortMonthDate(dateStr: string, locale: Locale): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(intl(locale), { day: 'numeric', month: 'long' });
}

export function shortDay(d: Date, locale: Locale): string {
  return d.toLocaleDateString(intl(locale), { weekday: 'short', day: 'numeric' });
}

export function weekRange(weekOffset: number, locale: Locale): string {
  const monday = mondayOf(weekOffset);
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => d.toLocaleDateString(intl(locale), { day: 'numeric', month: 'long' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

/** `mm:ss` para los temporizadores. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Franja por defecto al registrar un cocinado sin plan. */
export function slotForNow(now_: Date = now()): MealSlot {
  return now_.getHours() < 16 ? 'lunch' : 'dinner';
}
