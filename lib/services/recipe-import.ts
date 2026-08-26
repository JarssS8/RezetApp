import * as cheerio from 'cheerio'
import type { Locale } from '@/lib/domain/types'
import type { RecipeInput } from '@/lib/validation/recipes'

export type RecipeDraft = RecipeInput & { warnings: string[] }

const USER_AGENT = 'Mozilla/5.0 (compatible; RezetApp/0.1; +https://github.com/)'
// Tope de tamaño de la página descargada: una receta razonable no pasa de unos
// pocos cientos de KB de HTML; 2 MB evita que una URL maliciosa o un bug del
// origen fuerce a parsear un documento gigantesco en memoria.
const MAX_BODY_BYTES = 2 * 1024 * 1024

function emptyDraft(): RecipeDraft {
  return { title: '', servingsBase: 2, imageUrls: [], tags: [], ingredients: [], steps: [], warnings: [] }
}

// PT1H30M → 90
export function isoDurationToMinutes(s: unknown): number | null {
  if (typeof s !== 'string') return null
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(s.trim())
  if (!m) return null
  const [, d, h, min] = m
  const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0)
  return total > 0 ? total : null
}

export function yieldToServings(y: unknown): number | null {
  const s = Array.isArray(y) ? y[0] : y
  const n = typeof s === 'number' ? s : typeof s === 'string' ? Number(/\d+/.exec(s)?.[0]) : NaN
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n)) : null
}

type Json = Record<string, unknown>

function findRecipeNode(node: unknown): Json | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipeNode(n)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object' || node === null) return null
  const o = node as Json
  const type = o['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return o
  if (o['@graph']) return findRecipeNode(o['@graph'])
  return null
}

function text(v: unknown): string {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim()
  if (typeof v === 'object' && v !== null && 'text' in v) return text((v as Json).text)
  return ''
}

function instructions(v: unknown): string[] {
  if (typeof v === 'string') return v.split(/\n+|(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/).map((s) => s.trim()).filter(Boolean)
  if (!Array.isArray(v)) return []
  return v.flatMap((x) => {
    if (typeof x === 'object' && x !== null && (x as Json)['@type'] === 'HowToSection') return instructions((x as Json).itemListElement)
    const t = text(x)
    return t ? [t] : []
  })
}

function images(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : [v]
  return arr.map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x !== null ? text((x as Json).url) : '')).filter((s) => /^https?:\/\//.test(s)).slice(0, 10)
}

export function draftFromJsonLd(node: Json, url: string): RecipeDraft {
  const d = emptyDraft()
  d.title = text(node.name)
  d.description = text(node.description) || null
  d.servingsBase = yieldToServings(node.recipeYield) ?? 2
  d.prepMinutes = isoDurationToMinutes(node.prepTime)
  d.cookMinutes = isoDurationToMinutes(node.cookTime) ?? isoDurationToMinutes(node.totalTime)
  d.imageUrls = images(node.image)
  d.sourceUrl = url
  d.ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [])
    .map((s) => ({ rawText: text(s).slice(0, 200), scalesLinearly: true }))
    .filter((i) => i.rawText)
  d.steps = instructions(node.recipeInstructions).map((t) => ({ text: t.slice(0, 2000) }))
  const kw = typeof node.keywords === 'string' ? node.keywords.split(',') : Array.isArray(node.keywords) ? node.keywords : []
  d.tags = kw.map((k) => text(k)).filter(Boolean).slice(0, 20)
  if (!d.ingredients.length) d.warnings.push('no_ingredients')
  if (!d.steps.length) d.warnings.push('no_steps')
  return d
}

export function draftFromMicrodata($: cheerio.CheerioAPI, url: string): RecipeDraft | null {
  const root = $('[itemtype*="schema.org/Recipe"]').first()
  if (!root.length) return null
  const d = emptyDraft()
  const prop = (p: string) => root.find(`[itemprop="${p}"]`)
  d.title = prop('name').first().text().trim()
  d.description = prop('description').first().text().trim() || null
  d.servingsBase = yieldToServings(prop('recipeYield').first().text()) ?? 2
  d.prepMinutes = isoDurationToMinutes(prop('prepTime').attr('datetime') ?? prop('prepTime').attr('content'))
  d.cookMinutes = isoDurationToMinutes(prop('cookTime').attr('datetime') ?? prop('cookTime').attr('content'))
  d.imageUrls = images(
    prop('image')
      .map((_, el) => $(el).attr('src') ?? $(el).attr('content') ?? '')
      .get(),
  )
  d.sourceUrl = url
  d.ingredients = prop('recipeIngredient')
    .map((_, el) => ({ rawText: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200), scalesLinearly: true }))
    .get()
    .filter((i) => i.rawText)
  d.steps = prop('recipeInstructions')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .flatMap((t) => instructions(t))
    .map((t) => ({ text: t.slice(0, 2000) }))
  if (!d.ingredients.length) d.warnings.push('no_ingredients')
  if (!d.steps.length) d.warnings.push('no_steps')
  return d
}

// Solo http(s): evita que una URL file:/data:/gopher: cuele algo raro al fetch inyectado.
function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function importRecipeFromUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<RecipeDraft> {
  if (!isHttpUrl(url)) return { ...emptyDraft(), sourceUrl: url, warnings: ['invalid_url'] }
  const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, redirect: 'follow' })
  if (!res.ok) return { ...emptyDraft(), sourceUrl: url, warnings: ['fetch_failed'] }
  const contentLength = res.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) return { ...emptyDraft(), sourceUrl: url, warnings: ['body_too_large'] }
  const body = await res.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return { ...emptyDraft(), sourceUrl: url, warnings: ['body_too_large'] }
  const $ = cheerio.load(body)
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const node = findRecipeNode(JSON.parse($(el).text()))
      if (node) return draftFromJsonLd(node, url)
    } catch {
      // JSON-LD roto: probar el siguiente bloque
    }
  }
  const micro = draftFromMicrodata($, url)
  if (micro) return micro
  return { ...emptyDraft(), title: '', sourceUrl: url, warnings: ['no_recipe_found'] }
}

const INGREDIENT_HEADERS: Record<Locale, RegExp> = { es: /^ingredientes?\b/i, en: /^ingredients?\b/i }
const STEP_HEADERS: Record<Locale, RegExp> = { es: /^(preparaci[oó]n|elaboraci[oó]n|pasos)\b/i, en: /^(preparation|instructions|method|steps|directions)\b/i }
const QTY_LINE = /^(\d+([.,]\d+)?|[¼½¾⅓⅔]|un|una|a|an)\b/i

// Heurística: título = primera línea no vacía; ingredientes = bloque tras "Ingredientes" o líneas que empiezan por cantidad;
// pasos = bloque tras "Preparación" o líneas numeradas.
export function importRecipeFromText(raw: string, locale: Locale): RecipeDraft {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const d = emptyDraft()
  if (!lines.length) return { ...d, warnings: ['empty'] }
  d.title = lines[0]!.slice(0, 160)
  let mode: 'none' | 'ing' | 'steps' = 'none'
  for (const line of lines.slice(1)) {
    if (INGREDIENT_HEADERS[locale].test(line)) {
      mode = 'ing'
      continue
    }
    if (STEP_HEADERS[locale].test(line)) {
      mode = 'steps'
      continue
    }
    const numbered = /^\d+[.)]\s*/.test(line)
    if (mode === 'steps' || (mode === 'none' && numbered)) {
      d.steps.push({ text: line.replace(/^\d+[.)]\s*/, '').slice(0, 2000) })
      mode = mode === 'none' ? 'steps' : mode
      continue
    }
    if (mode === 'ing' || QTY_LINE.test(line)) {
      d.ingredients.push({ rawText: line.replace(/^[-•*]\s*/, '').slice(0, 200), scalesLinearly: true })
      continue
    }
    if (mode === 'none' && !d.description) d.description = line.slice(0, 2000)
  }
  if (!d.ingredients.length) d.warnings.push('no_ingredients')
  if (!d.steps.length) d.warnings.push('no_steps')
  return d
}
