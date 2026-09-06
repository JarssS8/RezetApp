import type { Locale, MealSlot } from '../types';

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Clave ISO local `YYYY-MM-DD`, estable frente a zonas horarias. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
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
  return dateKey(addDays(new Date(), days));
}

/** Lunes de la semana, con desplazamiento en semanas. */
export function mondayOf(weekOffset: number): Date {
  const d = new Date();
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
export function slotForNow(now = new Date()): MealSlot {
  return now.getHours() < 16 ? 'lunch' : 'dinner';
}
