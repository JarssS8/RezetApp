import type { BaseUnit, Locale } from './types'

// Unidades canónicas. `base` + `factor` → conversión directa; `null` → cuenta por piezas o no convertible.
export interface CanonicalUnit {
  id: string
  base: BaseUnit | null
  factor: number | null
  kind: 'mass' | 'volume' | 'count' | 'vague'
  label: Record<Locale, { one: string; many: string }>
}

export const CANONICAL_UNITS: CanonicalUnit[] = [
  { id: 'g', base: 'g', factor: 1, kind: 'mass', label: { es: { one: 'g', many: 'g' }, en: { one: 'g', many: 'g' } } },
  { id: 'kg', base: 'g', factor: 1000, kind: 'mass', label: { es: { one: 'kg', many: 'kg' }, en: { one: 'kg', many: 'kg' } } },
  { id: 'oz', base: 'g', factor: 28.35, kind: 'mass', label: { es: { one: 'oz', many: 'oz' }, en: { one: 'oz', many: 'oz' } } },
  { id: 'lb', base: 'g', factor: 453.6, kind: 'mass', label: { es: { one: 'lb', many: 'lb' }, en: { one: 'lb', many: 'lb' } } },
  { id: 'ml', base: 'ml', factor: 1, kind: 'volume', label: { es: { one: 'ml', many: 'ml' }, en: { one: 'ml', many: 'ml' } } },
  { id: 'l', base: 'ml', factor: 1000, kind: 'volume', label: { es: { one: 'l', many: 'l' }, en: { one: 'l', many: 'l' } } },
  { id: 'floz', base: 'ml', factor: 29.57, kind: 'volume', label: { es: { one: 'fl oz', many: 'fl oz' }, en: { one: 'fl oz', many: 'fl oz' } } },
  { id: 'tsp', base: 'ml', factor: 5, kind: 'volume', label: { es: { one: 'cdta', many: 'cdtas' }, en: { one: 'tsp', many: 'tsp' } } },
  { id: 'tbsp', base: 'ml', factor: 15, kind: 'volume', label: { es: { one: 'cda', many: 'cdas' }, en: { one: 'tbsp', many: 'tbsp' } } },
  { id: 'cup', base: 'ml', factor: 240, kind: 'volume', label: { es: { one: 'taza', many: 'tazas' }, en: { one: 'cup', many: 'cups' } } },
  { id: 'ud', base: 'ud', factor: 1, kind: 'count', label: { es: { one: 'ud', many: 'uds' }, en: { one: 'pc', many: 'pcs' } } },
  { id: 'clove', base: null, factor: null, kind: 'count', label: { es: { one: 'diente', many: 'dientes' }, en: { one: 'clove', many: 'cloves' } } },
  { id: 'leaf', base: null, factor: null, kind: 'count', label: { es: { one: 'hoja', many: 'hojas' }, en: { one: 'leaf', many: 'leaves' } } },
  { id: 'sprig', base: null, factor: null, kind: 'count', label: { es: { one: 'rama', many: 'ramas' }, en: { one: 'sprig', many: 'sprigs' } } },
  { id: 'slice', base: null, factor: null, kind: 'count', label: { es: { one: 'loncha', many: 'lonchas' }, en: { one: 'slice', many: 'slices' } } },
  { id: 'can', base: null, factor: null, kind: 'count', label: { es: { one: 'lata', many: 'latas' }, en: { one: 'can', many: 'cans' } } },
  { id: 'jar', base: null, factor: null, kind: 'count', label: { es: { one: 'bote', many: 'botes' }, en: { one: 'jar', many: 'jars' } } },
  { id: 'packet', base: null, factor: null, kind: 'count', label: { es: { one: 'sobre', many: 'sobres' }, en: { one: 'packet', many: 'packets' } } },
  { id: 'handful', base: null, factor: null, kind: 'vague', label: { es: { one: 'puñado', many: 'puñados' }, en: { one: 'handful', many: 'handfuls' } } },
  { id: 'pinch', base: null, factor: null, kind: 'vague', label: { es: { one: 'pizca', many: 'pizcas' }, en: { one: 'pinch', many: 'pinches' } } },
  { id: 'splash', base: null, factor: null, kind: 'vague', label: { es: { one: 'chorrito', many: 'chorritos' }, en: { one: 'splash', many: 'splashes' } } },
]

// Alias → id canónico. Sin acentos, en minúsculas, singular y plural explícitos.
const ALIASES: Record<Locale, Record<string, string>> = {
  es: {
    g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
    ml: 'ml', mililitro: 'ml', mililitros: 'ml', l: 'l', litro: 'l', litros: 'l', cl: 'ml', oz: 'oz', onza: 'oz', onzas: 'oz', lb: 'lb', libra: 'lb', libras: 'lb',
    cdta: 'tsp', cdtas: 'tsp', cucharadita: 'tsp', cucharaditas: 'tsp', 'c/c': 'tsp',
    cda: 'tbsp', cdas: 'tbsp', cucharada: 'tbsp', cucharadas: 'tbsp', 'cucharada sopera': 'tbsp', 'cucharadas soperas': 'tbsp', 'c/s': 'tbsp',
    taza: 'cup', tazas: 'cup', vaso: 'cup', vasos: 'cup',
    ud: 'ud', uds: 'ud', unidad: 'ud', unidades: 'ud', pieza: 'ud', piezas: 'ud',
    diente: 'clove', dientes: 'clove', hoja: 'leaf', hojas: 'leaf', rama: 'sprig', ramas: 'sprig', ramita: 'sprig', ramitas: 'sprig',
    loncha: 'slice', lonchas: 'slice', rebanada: 'slice', rebanadas: 'slice', rodaja: 'slice', rodajas: 'slice', filete: 'slice', filetes: 'slice',
    lata: 'can', latas: 'can', bote: 'jar', botes: 'jar', tarro: 'jar', tarros: 'jar', sobre: 'packet', sobres: 'packet', paquete: 'packet', paquetes: 'packet',
    punado: 'handful', punados: 'handful', pizca: 'pinch', pizcas: 'pinch', pellizco: 'pinch', pellizcos: 'pinch', chorrito: 'splash', chorro: 'splash', chorritos: 'splash',
  },
  en: {
    g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', 'fl oz': 'floz', floz: 'floz',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cup: 'cup', cups: 'cup',
    pc: 'ud', pcs: 'ud', piece: 'ud', pieces: 'ud', unit: 'ud', units: 'ud',
    clove: 'clove', cloves: 'clove', sprig: 'sprig', sprigs: 'sprig', slice: 'slice', slices: 'slice',
    can: 'can', cans: 'can', jar: 'jar', jars: 'jar', packet: 'packet', packets: 'packet', package: 'packet', sachet: 'packet',
    handful: 'handful', handfuls: 'handful', pinch: 'pinch', pinches: 'pinch', splash: 'splash', dash: 'splash',
  },
}

// Alias cuyo factor a unidad base difiere del de su unidad canónica.
// cl no está en la tabla canónica: 1 cl = 10 ml (mientras que 'ml' tiene factor 1).
const ALIAS_FACTOR_OVERRIDES: Record<string, number> = { cl: 10 }

// Lo que se vuelca a la tabla unit_aliases (solo convertibles)
export const UNIT_ALIASES: { alias: string; locale: Locale; unit: BaseUnit; factorToBase: number }[] = (['es', 'en'] as Locale[]).flatMap((locale) =>
  Object.entries(ALIASES[locale]).flatMap(([alias, id]) => {
    const u = CANONICAL_UNITS.find((c) => c.id === id)
    if (!u || u.base === null || u.factor === null) return []
    const factor = ALIAS_FACTOR_OVERRIDES[alias] ?? u.factor
    return [{ alias, locale, unit: u.base, factorToBase: factor }]
  }),
)

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function findUnit(alias: string, locale: Locale): CanonicalUnit | null {
  const key = stripAccents(alias.toLowerCase().trim().replace(/\.$/, ''))
  const id = ALIASES[locale][key] ?? ALIASES[locale === 'es' ? 'en' : 'es'][key] ?? CANONICAL_UNITS.find((c) => c.id === key)?.id
  const unit = id ? (CANONICAL_UNITS.find((c) => c.id === id) ?? null) : null
  if (!unit) return null
  // Alias como 'cl' comparten unidad canónica pero no su factor (ver ALIAS_FACTOR_OVERRIDES)
  const overrideFactor = ALIAS_FACTOR_OVERRIDES[key]
  return overrideFactor === undefined ? unit : { ...unit, factor: overrideFactor }
}

export function unitLabel(id: string, qty: number, locale: Locale): string {
  const u = CANONICAL_UNITS.find((c) => c.id === id)
  if (!u) return id
  return qty === 1 ? u.label[locale].one : u.label[locale].many
}
