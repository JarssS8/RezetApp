import { findUnit, stripAccents } from './units-data'
import type { Locale, ParsedIngredient } from './types'

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }
const NUMBER_WORDS: Record<Locale, Record<string, number>> = {
  es: { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, medio: 0.5, media: 0.5 },
  en: { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5 },
}
const APPROX: Record<Locale, string[]> = { es: ['unos', 'unas', 'aprox', 'aproximadamente', 'sobre'], en: ['about', 'approx', 'approximately', 'around'] }
const TO_TASTE: Record<Locale, string[]> = { es: ['al gusto', 'a gusto', 'c/n', 'cantidad necesaria'], en: ['to taste', 'as needed'] }
// Participios que separan alimento de preparación cuando van al final, antes de coma, "y"/"and" o "en"
const PARTICIPLES: Record<Locale, string[]> = {
  es: ['picado', 'picada', 'picados', 'picadas', 'rallado', 'rallada', 'rallados', 'ralladas', 'troceado', 'troceada', 'troceados', 'troceadas', 'cortado', 'cortada', 'cortados', 'cortadas', 'pelado', 'pelada', 'pelados', 'peladas', 'cocido', 'cocida', 'cocidos', 'cocidas', 'escurrido', 'escurrida', 'escurridos', 'escurridas', 'fundido', 'fundida', 'derretido', 'derretida', 'batido', 'batida', 'batidos', 'molido', 'molida', 'machacado', 'machacada', 'machacados', 'fileteado', 'fileteada', 'desmenuzado', 'desmenuzada', 'laminado', 'laminada', 'laminados', 'laminadas', 'tamizado', 'tamizada', 'deshuesado', 'deshuesada', 'deshuesados', 'deshuesadas', 'descongelado', 'descongelada'],
  en: ['minced', 'diced', 'chopped', 'sliced', 'grated', 'drained', 'softened', 'beaten', 'peeled', 'cubed', 'melted', 'crushed', 'shredded', 'rinsed', 'thawed', 'toasted', 'crumbled', 'halved', 'quartered', 'juiced', 'zested', 'sifted', 'whisked', 'cooked', 'mashed', 'trimmed'],
}
const ADVERBS: Record<Locale, string[]> = { es: ['recien', 'bien', 'muy', 'finamente'], en: ['finely', 'freshly', 'roughly', 'thinly', 'coarsely'] }
// Conectores que, si sobreviven al principio o al final del alimento, indican
// que el corte se hizo mal ("de aceite de oliva y", "of the")
const CONNECTORS: Record<Locale, string[]> = { es: ['de', 'del', 'y'], en: ['of', 'and'] }
const REVIEW_CONFIDENCE = 0.5

function parseNumberToken(tok: string, locale: Locale): number | null {
  if (UNICODE_FRACTIONS[tok] !== undefined) return UNICODE_FRACTIONS[tok] ?? null
  const frac = /^(\d+)\/(\d+)$/.exec(tok)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const dec = /^(\d+)(?:[.,](\d+))?$/.exec(tok)
  if (dec) return Number(`${dec[1]}.${dec[2] ?? '0'}`)
  const mixedUnicode = /^(\d+)([¼½¾⅓⅔⅛])$/.exec(tok)
  if (mixedUnicode) return Number(mixedUnicode[1]) + (UNICODE_FRACTIONS[mixedUnicode[2] ?? ''] ?? 0)
  return NUMBER_WORDS[locale][tok] ?? null
}

// Devuelve cantidad y el resto de la línea sin ella
function takeQuantity(text: string, locale: Locale): { quantity: number | null; rest: string } {
  let rest = text
  const first = rest.split(' ')[0] ?? ''
  if (APPROX[locale].includes(stripAccents(first))) rest = rest.slice(first.length).trim()
  const tokens = rest.split(' ')
  const t0 = tokens[0] ?? ''
  // rangos "2-3", "2 - 3", "2 a 3", "2 to 3" → media
  const rangeInline = /^(\d+(?:[.,]\d+)?)[-–](\d+(?:[.,]\d+)?)$/.exec(t0)
  const rangeSpaced = /^(\d+(?:[.,]\d+)?)\s*(?:-|–|a|to)\s*(\d+(?:[.,]\d+)?)$/.exec(tokens.slice(0, 3).join(' '))
  const m = rangeInline ?? rangeSpaced
  if (m) {
    const a = Number((m[1] ?? '0').replace(',', '.'))
    const b = Number((m[2] ?? '0').replace(',', '.'))
    return { quantity: (a + b) / 2, rest: tokens.slice(rangeInline ? 1 : 3).join(' ') }
  }
  const n0 = parseNumberToken(t0, locale)
  if (n0 === null) return { quantity: null, rest }
  // "1 y 1/2", "1 and 1/2", "1 ½"
  const conj = locale === 'es' ? 'y' : 'and'
  if (tokens[1] === conj && tokens[2] !== undefined) {
    const n2 = parseNumberToken(tokens[2], locale)
    if (n2 !== null && n2 < 1) return { quantity: n0 + n2, rest: tokens.slice(3).join(' ') }
  }
  if (tokens[1] !== undefined && UNICODE_FRACTIONS[tokens[1]] !== undefined) {
    return { quantity: n0 + (UNICODE_FRACTIONS[tokens[1]] ?? 0), rest: tokens.slice(2).join(' ') }
  }
  return { quantity: n0, rest: tokens.slice(1).join(' ') }
}

// Devuelve unidad canónica y el resto sin ella ni el "de"/"of" siguiente
function takeUnit(text: string, locale: Locale, hasQuantity: boolean): { unit: string | null; rest: string } {
  const tokens = text.split(' ')
  // Unidades de dos palabras primero ("cucharada sopera", "fl oz")
  for (const len of [2, 1]) {
    const candidate = tokens.slice(0, len).join(' ')
    if (!candidate) continue
    const u = findUnit(candidate, locale)
    if (!u) continue
    // En inglés, "leaf"/"slice" solo son unidad con cantidad delante y seguido de "of"; "bay leaf" es alimento
    if (locale === 'en' && (u.id === 'leaf' || u.id === 'slice') && tokens[len] !== 'of') continue
    if (!hasQuantity && u.kind !== 'vague') continue
    let rest = tokens.slice(len).join(' ')
    // \s* (no espacio literal) para que "de"/"of" sin nada detrás también se elimine
    // (p. ej. "2 cdas de" → alimento vacío, no "de")
    rest = rest.replace(locale === 'es' ? /^de\s*(la |el |los |las )?/ : /^of\s*(the )?/, '')
    return { unit: u.id, rest }
  }
  return { unit: null, rest: text }
}

function splitPreparation(text: string, locale: Locale): { food: string; preparation: string | null } {
  const parts: string[] = []
  let food = text
  // Paréntesis → preparación
  const paren = /\(([^)]*)\)/.exec(food)
  if (paren) {
    parts.push(`(${paren[1]})`)
    // "1 taza (240 ml) de arroz" → quitar el "de"/"of" que quedaba detrás del paréntesis
    food = food.replace(paren[0], ' ').replace(/\s+/g, ' ').trim().replace(/^(de|of) /, '')
  }
  // Coma → todo lo que sigue es preparación
  const comma = food.indexOf(',')
  if (comma >= 0) {
    parts.push(food.slice(comma + 1).trim())
    food = food.slice(0, comma).trim()
  }
  // "al gusto" / "to taste"
  for (const t of TO_TASTE[locale]) {
    if (stripAccents(food).endsWith(t)) {
      parts.unshift(food.slice(food.length - t.length).trim())
      food = food.slice(0, food.length - t.length).trim()
    }
  }
  // " para …" en español separa finalidad ("vino blanco para desglasar", "nata para cocinar"): el alimento queda más limpio para resolverlo
  if (locale === 'es') {
    const words = food.split(' ')
    const k = words.findIndex((w, i) => i > 0 && w === 'para')
    if (k > 0) {
      parts.unshift(words.slice(k).join(' '))
      food = words.slice(0, k).join(' ')
    }
  }
  // Participio al final del alimento (español: detrás del nombre)
  if (locale === 'es') {
    const ws = food.split(' ')
    const last = stripAccents(ws[ws.length - 1] ?? '')
    if (ws.length > 1 && PARTICIPLES.es.includes(last)) {
      let cut = ws.length - 1
      if (cut > 1 && ADVERBS.es.includes(stripAccents(ws[cut - 1] ?? ''))) cut -= 1
      parts.unshift(ws.slice(cut).join(' '))
      food = ws.slice(0, cut).join(' ')
    }
  }
  return { food: food.trim(), preparation: parts.length ? parts.join(', ').trim() : null }
}

export function parseIngredientLine(raw: string, locale: Locale): ParsedIngredient {
  // (?!\d) evita tocar comas decimales ("1,5 kg"): solo normaliza espacios
  // alrededor de comas separadoras (listas de preparación, "cocidos, escurridos")
  const text = raw.trim().replace(/\s+/g, ' ').replace(/\s*,\s*(?!\d)/g, ', ').replace(/\s+\(/g, ' (')
  if (!text) return { quantity: null, unit: null, foodName: '', preparation: null, confidence: 0, needsReview: true }
  const lower = text.toLowerCase()
  const q = takeQuantity(lower, locale)
  let unitPart = q.rest
  // "¼ de taza" → quitar "de" entre número y unidad
  if (locale === 'es' && q.quantity !== null) unitPart = unitPart.replace(/^de /, '')
  // Si el "de" precedía a algo que no es unidad ("zumo de medio limón" no entra aquí porque no empieza por número)
  const u = takeUnit(unitPart, locale, q.quantity !== null)
  const originalCase = text.slice(text.length - u.rest.length) // conserva mayúsculas/acentos del original
  const { food, preparation } = splitPreparation(originalCase.trim() || u.rest, locale)
  let confidence = 1
  if (q.quantity === null) confidence = 0.7
  else if (u.unit === null) confidence = 0.8
  if (!food) confidence = 0.4
  if (needsHumanEye(food, q.quantity, u.unit, locale)) confidence = Math.min(confidence, REVIEW_CONFIDENCE)
  return { quantity: q.quantity, unit: u.unit, foodName: food, preparation, confidence, needsReview: confidence < 0.6 }
}

// Señales de que la línea se ha entendido mal y conviene que alguien la mire:
// baja la confianza por debajo del umbral de revisión (0.6).
function needsHumanEye(food: string, quantity: number | null, unit: string | null, locale: Locale): boolean {
  const words = food.split(' ').filter(Boolean)
  // Un número dentro del nombre casi siempre es una cantidad que no se separó
  // ("2 latas de 400 g de tomate" → "tomate de 400 g")
  if (/\d/.test(food)) return true
  const connectors = CONNECTORS[locale]
  const first = stripAccents(words[0] ?? '')
  const last = stripAccents(words[words.length - 1] ?? '')
  if (words.length > 0 && (connectors.includes(first) || connectors.includes(last))) return true
  // Sin cantidad ni unidad y con un nombre largo: probablemente sea una frase, no un ingrediente
  if (quantity === null && unit === null && words.length > 3) return true
  // Unidad vaga (pizca, chorrito, puñado) sobre un nombre largo: el reparto entre
  // unidad, alimento y preparación es dudoso
  const vague = unit !== null && findUnit(unit, locale)?.kind === 'vague'
  return vague && words.length > 2
}
