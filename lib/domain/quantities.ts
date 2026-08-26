import { findUnit, stripAccents, unitLabel } from './units-data'
import type { BaseUnit, DisplayQuantity, FoodConversion, Locale, UnitSystem } from './types'

const FRACTIONS: [number, string][] = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']]
const FRACTION_TOLERANCE = 0.05
// g/ml redondean a entero; kg/l/oz/lb/fl oz llevan un decimal sin fracciones.
// `kind` no basta para distinguirlas de tsp/tbsp/cup (también 'volume' pero con fracciones bonitas).
const NO_FRACTION_UNITS = new Set(['g', 'ml', 'kg', 'l', 'oz', 'lb', 'floz'])

export function normalizeSearchName(s: string): string {
  return stripAccents(s).toLowerCase().trim().replace(/\s+/g, ' ')
}

// Número según reglas de presentación de docs/03 §1
export function formatNumber(qty: number, unit: string | null, locale: Locale): string {
  const u = unit ? findUnit(unit, locale) : null
  if (u && NO_FRACTION_UNITS.has(u.id)) {
    if (u.id === 'g' || u.id === 'ml') return String(Math.round(qty))
    // kg, l, oz, lb, fl oz: un decimal, nunca fracciones
    const d = Math.round(qty * 10) / 10
    const str = Number.isInteger(d) ? String(d) : d.toFixed(1)
    return locale === 'es' ? str.replace('.', ',') : str
  }
  if (qty >= 10) return String(Math.round(qty))
  const whole = Math.floor(qty)
  const frac = qty - whole
  if (frac < FRACTION_TOLERANCE) return String(whole)
  if (frac > 1 - FRACTION_TOLERANCE) return String(whole + 1)
  const hit = FRACTIONS.find(([v]) => Math.abs(v - frac) < FRACTION_TOLERANCE)
  if (hit) return whole === 0 ? hit[1] : `${whole} ${hit[1]}`
  const oneDecimal = (Math.round(qty * 10) / 10).toFixed(1)
  return locale === 'es' ? oneDecimal.replace('.', ',') : oneDecimal
}

export function formatQuantity(qty: number | null, unit: string | null, locale: Locale): string {
  if (qty === null) return ''
  const num = formatNumber(qty, unit, locale)
  if (!unit) return num
  const u = findUnit(unit, locale)
  const label = u ? unitLabel(u.id, qty <= 1 ? 1 : 2, locale) : unit // singular hasta 1 inclusive ("¼ taza", "1 ½ cdtas")
  return `${num} ${label}`
}

const TSP_PER_TBSP = 3
const TBSP_PER_CUP = 16

// Orden: piezas → tazas/cucharadas por alimento → alias directo → densidad → null
export function toBaseUnit(qty: number, unit: string, locale: Locale, food?: FoodConversion): { qty: number; unit: BaseUnit } | null {
  const u = findUnit(unit, locale)
  if (!u) return null
  if (u.id === 'ud') {
    return food?.gramsPerUnit ? { qty: qty * food.gramsPerUnit, unit: 'g' } : { qty, unit: 'ud' }
  }
  if (food) {
    if (u.id === 'cup' && food.gramsPerCup) return { qty: qty * food.gramsPerCup, unit: 'g' }
    if (u.id === 'tbsp' && food.gramsPerTbsp) return { qty: qty * food.gramsPerTbsp, unit: 'g' }
    if (u.id === 'tsp' && food.gramsPerTbsp) return { qty: (qty * food.gramsPerTbsp) / TSP_PER_TBSP, unit: 'g' }
    if (u.id === 'cup' && food.gramsPerTbsp) return { qty: qty * food.gramsPerTbsp * TBSP_PER_CUP, unit: 'g' }
    if (u.id === 'tbsp' && food.gramsPerCup) return { qty: (qty * food.gramsPerCup) / TBSP_PER_CUP, unit: 'g' }
  }
  if (u.base === null || u.factor === null) return null
  const base = { qty: qty * u.factor, unit: u.base }
  if (base.unit === 'ml' && food?.defaultUnit === 'g' && food.densityGPerMl) return { qty: base.qty * food.densityGPerMl, unit: 'g' }
  return base
}

export function toDisplayUnit(qty: number, base: BaseUnit, food: FoodConversion | null, system: UnitSystem, preferred?: string): DisplayQuantity {
  if (preferred && food) {
    if (preferred === 'cup' && base === 'g' && food.gramsPerCup) return { quantity: qty / food.gramsPerCup, unit: 'cup' }
    if (preferred === 'tbsp' && base === 'g' && food.gramsPerTbsp) return { quantity: qty / food.gramsPerTbsp, unit: 'tbsp' }
    if (preferred === 'tsp' && base === 'g' && food.gramsPerTbsp) return { quantity: (qty * TSP_PER_TBSP) / food.gramsPerTbsp, unit: 'tsp' }
    if (preferred === 'ud' && base === 'g' && food.gramsPerUnit) return { quantity: qty / food.gramsPerUnit, unit: 'ud' }
  }
  if (base === 'ud') return { quantity: qty, unit: 'ud' }
  if (system === 'imperial') {
    if (base === 'g') return qty >= 453.6 ? { quantity: qty / 453.6, unit: 'lb' } : { quantity: qty / 28.35, unit: 'oz' }
    return qty >= 240 ? { quantity: qty / 240, unit: 'cup' } : { quantity: qty / 29.57, unit: 'floz' }
  }
  if (base === 'g') return qty >= 1000 ? { quantity: qty / 1000, unit: 'kg' } : { quantity: qty, unit: 'g' }
  return qty >= 1000 ? { quantity: qty / 1000, unit: 'l' } : { quantity: qty, unit: 'ml' }
}
