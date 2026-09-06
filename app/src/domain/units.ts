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

export function formatKcal(kcal: number, locale: Locale): string {
  return Math.round(kcal).toLocaleString(locale === 'es' ? 'es-ES' : 'en-US');
}

/** Paso del stepper de despensa: 1 para unidades, 100 para peso y volumen. */
export function pantryStep(unit: Unit): number {
  return unit === 'ud' ? 1 : 100;
}

const QUANTITY_INPUT_RE = /^([\d.,]+)\s*(g|kg|ml|l|ud|uds|pcs)?\s*$/i;
const LEADING_NUMBER_RE = /^([\d.,]+)/;

function toNumber(raw: string | undefined): number {
  const n = parseFloat((raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Parsea "500 g" / "2 kg" / "3" en cantidad + unidad. Sin unidad escrita, o
 * con un sufijo que no reconoce, usa `fallbackUnit` — pero SIEMPRE conserva
 * el número que escribió el usuario, nunca lo descarta a 1 solo porque la
 * unidad no se entendió. kg/l se normalizan a g/ml. Nunca lanza.
 */
export function parseQuantityInput(input: string, fallbackUnit: Unit): { quantity: number; unit: Unit } {
  const trimmed = input.trim();
  const full = trimmed.match(QUANTITY_INPUT_RE);
  if (!full) {
    const lead = trimmed.match(LEADING_NUMBER_RE);
    return { quantity: toNumber(lead?.[1]), unit: fallbackUnit };
  }
  const quantity = toNumber(full[1]);
  const rawUnit = (full[2] ?? '').toLowerCase();
  if (rawUnit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (rawUnit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  if (rawUnit === 'g' || rawUnit === 'ml') return { quantity, unit: rawUnit };
  if (rawUnit === 'ud' || rawUnit === 'uds' || rawUnit === 'pcs') return { quantity, unit: 'ud' };
  return { quantity, unit: fallbackUnit };
}
