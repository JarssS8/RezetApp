import type { Locale, Unit, UnitSystem } from '../types';

const G_PER_OZ = 28.35;
const ML_PER_FLOZ = 29.57;

/** Redondeo del diseño: un decimal, y sin decimal si el resto es < 0.05. */
export function roundNice(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) : r;
}

export function formatNumber(n: number, locale: Locale): string {
  return roundNice(n).toLocaleString(locale === 'es' ? 'es-ES' : 'en-US');
}

/**
 * Cantidad con unidad, en el sistema activo.
 * Las unidades sueltas (`ud`) nunca se convierten: se muestran como uds / pcs.
 */
export function formatQuantity(
  quantity: number,
  unit: Unit,
  system: UnitSystem,
  locale: Locale,
): string {
  if (system === 'imperial') {
    if (unit === 'g') return `${formatNumber(quantity / G_PER_OZ, locale)} oz`;
    if (unit === 'ml') return `${formatNumber(quantity / ML_PER_FLOZ, locale)} fl oz`;
  }
  if (unit === 'ud') return `${formatNumber(quantity, locale)} ${locale === 'es' ? 'uds' : 'pcs'}`;
  return `${formatNumber(quantity, locale)} ${unit}`;
}

/** Solo la etiqueta de unidad resuelta (sin cantidad), consciente de sistema/locale. */
export function formatUnitLabel(unit: Unit, system: UnitSystem, locale: Locale): string {
  if (system === 'imperial') {
    if (unit === 'g') return 'oz';
    if (unit === 'ml') return 'fl oz';
  }
  if (unit === 'ud') return locale === 'es' ? 'uds' : 'pcs';
  return unit;
}

export function formatKcal(kcal: number, locale: Locale): string {
  return Math.round(kcal).toLocaleString(locale === 'es' ? 'es-ES' : 'en-US');
}

/** Paso del stepper de despensa: 1 para unidades, 100 para peso y volumen. */
export function pantryStep(unit: Unit): number {
  return unit === 'ud' ? 1 : 100;
}
