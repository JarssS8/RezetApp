import * as cheerio from 'cheerio'
import type { Locale } from '@/lib/domain/types'
import type { RecipeInput } from '@/lib/validation/recipes'

export type RecipeDraft = RecipeInput & { warnings: string[] }

const USER_AGENT = 'Mozilla/5.0 (compatible; RezetApp/0.1; +https://github.com/)'
// Tope de tamaño de la página descargada: una receta razonable no pasa de unos
// pocos cientos de KB de HTML; 2 MB evita que una URL maliciosa o un bug del
// origen fuerce a parsear un documento gigantesco en memoria.
const MAX_BODY_BYTES = 2 * 1024 * 1024
// SSRF (W2-R15): como máximo 3 saltos de redirección antes de rendirse.
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

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
  d.title = text(node.name).slice(0, 160)
  d.description = text(node.description).slice(0, 2000) || null
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
  d.title = prop('name').first().text().trim().slice(0, 160)
  d.description = prop('description').first().text().trim().slice(0, 2000) || null
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

// URL.hostname devuelve las IPv6 entre corchetes ('[::1]'); hay que quitarlos
// antes de comparar contra rangos reservados.
function stripIPv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

// Loopback (127/8), LAN privada (10/8, 172.16/12, 192.168/16), link-local
// (169.254/16) y 0.0.0.0. new URL() ya canonicaliza a esta forma cualquier
// variante decimal/octal/hex de la IP (ver lib/validation/household.ts para
// el mismo patrón, congelado y no reutilizable directamente desde aquí).
function isReservedIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const octets = [m[1], m[2], m[3], m[4]].map(Number)
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b, c, d] = octets
  if (a === undefined || b === undefined || c === undefined || d === undefined) return false
  if (a === 127) return true // loopback 127.0.0.0/8
  if (a === 10) return true // LAN 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // LAN 172.16.0.0/12
  if (a === 192 && b === 168) return true // LAN 192.168.0.0/16
  if (a === 169 && b === 254) return true // link-local 169.254.0.0/16
  if (a === 0 && b === 0 && c === 0 && d === 0) return true // 0.0.0.0
  return false
}

// new URL() normaliza cualquier IPv4-mapped ('::ffff:127.0.0.1',
// '::ffff:192.168.1.20'…) a su forma hexadecimal ('::ffff:7f00:1',
// '::ffff:c0a8:114'…); hay que deshacerla para aplicar isReservedIPv4.
function ipv4MappedToDotted(hostname: string): string | null {
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname)
  if (!m || m[1] === undefined || m[2] === undefined) return null
  const g1 = Number.parseInt(m[1], 16)
  const g2 = Number.parseInt(m[2], 16)
  return [(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff].join('.')
}

// Primer grupo hexadecimal de una IPv6 completa (sin comprimir con '::' al
// principio): sirve para acotar fe80::/10 (link-local) y fc00::/7 (ULA) sin
// tener que expandir la dirección entera.
function firstHextet(hostname: string): number | null {
  const m = /^([0-9a-f]{1,4})(?::|$)/i.exec(hostname)
  return m && m[1] !== undefined ? Number.parseInt(m[1], 16) : null
}

// Host privado o reservado: no debe usarse como destino de una descarga que
// dispara la propia app (SSRF, W2-R15). Cubre nombres reservados, loopback,
// LAN privada, link-local (v4 y v6), ULA v6 e IPv4-mapped-a-IPv6.
function isPrivateOrReservedHost(rawHostname: string): boolean {
  const h = stripIPv6Brackets(rawHostname).toLowerCase()
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true
  if (isReservedIPv4(h)) return true
  const mapped = ipv4MappedToDotted(h)
  if (mapped !== null) return isReservedIPv4(mapped)
  if (!h.includes(':')) return false // no es una IPv6: ya se descartó como IPv4 arriba
  const hextet = firstHextet(h)
  if (hextet === null) return false
  if (hextet >= 0xfe80 && hextet <= 0xfebf) return true // link-local fe80::/10
  if (hextet >= 0xfc00 && hextet <= 0xfdff) return true // ULA fc00::/7
  return false
}

// Solo http(s) a un host público: bloquea file:/data:/gopher:… y cualquier
// destino que resuelva a localhost, LAN o loopback antes de llegar a fetch.
function isPublicHttpUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !isPrivateOrReservedHost(parsed.hostname)
}

export async function importRecipeFromUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<RecipeDraft> {
  if (!isPublicHttpUrl(url)) return { ...emptyDraft(), sourceUrl: url, warnings: ['invalid_url'] }

  let currentUrl = url
  let redirects = 0
  let res: Response
  // redirect: 'manual' para poder validar cada salto antes de seguirlo (si no,
  // el propio fetch seguiría una redirección a un host privado sin que este
  // código llegue a verla).
  for (;;) {
    res = await fetchImpl(currentUrl, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(res.status)) break
    redirects += 1
    if (redirects > MAX_REDIRECTS) return { ...emptyDraft(), sourceUrl: url, warnings: ['fetch_failed'] }
    const location = res.headers.get('location')
    if (!location) return { ...emptyDraft(), sourceUrl: url, warnings: ['fetch_failed'] }
    let next: URL
    try {
      next = new URL(location, currentUrl)
    } catch {
      return { ...emptyDraft(), sourceUrl: url, warnings: ['fetch_failed'] }
    }
    if (!isPublicHttpUrl(next.toString())) return { ...emptyDraft(), sourceUrl: url, warnings: ['invalid_url'] }
    currentUrl = next.toString()
  }
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
