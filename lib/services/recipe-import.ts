import * as cheerio from 'cheerio'
import type { z } from 'zod'
import type { Locale } from '@/lib/domain/types'
import { isPrivateOrReservedHost } from '@/lib/net-hosts'
import { readImage } from '@/lib/uploads/store'
import type { RecipeImportSchema, RecipeInput } from '@/lib/validation/recipes'
import { aiImportRecipe, type AiFailureCode, type AiTaskDeps } from './ai-tasks'
import type { Ctx } from './ctx'

export type RecipeDraft = RecipeInput & { warnings: string[] }

// Todos los códigos de aviso que puede llevar un borrador. La interfaz los
// traduce con recipes.import.warnings.<code> (components/recipes/import-form.tsx).
export type RecipeImportWarning =
  | 'no_recipe_found'
  | 'no_ingredients'
  | 'no_steps'
  | 'fetch_failed'
  | 'empty'
  | 'invalid_url'
  | 'body_too_large'
  | 'upload_not_found'
  | 'ai_no_provider'
  | 'ai_unsupported'
  | 'ai_budget'
  | 'ai_output'

// Un fallo de IA NO es una excepción: la app funciona sin IA (regla 3 de
// AGENTS.md) y este camino tiene que degradar igual para la interfaz, para
// REST y para el MCP. Se devuelve un borrador vacío con el motivo dentro.
const AI_WARNING: Record<AiFailureCode, RecipeImportWarning> = {
  no_provider: 'ai_no_provider',
  ai_unsupported: 'ai_unsupported',
  ai_budget: 'ai_budget',
  ai_output: 'ai_output',
  internal: 'ai_output',
}

const USER_AGENT = 'Mozilla/5.0 (compatible; RezetApp/0.1; +https://github.com/)'
// Tope de tamaño de la página descargada: una receta razonable no pasa de unos
// pocos cientos de KB de HTML; 2 MB evita que una URL maliciosa o un bug del
// origen fuerce a parsear un documento gigantesco en memoria.
const MAX_BODY_BYTES = 2 * 1024 * 1024
// SSRF (W2-R15): como máximo 3 saltos de redirección antes de rendirse.
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
// Tope de tiempo por petición (fix 10 de la revisión final): sin esto, un origen que
// no responde nunca (o responde muy despacio a propósito) cuelga la importación.
const FETCH_TIMEOUT_MS = 8000

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

// Lee el cuerpo con un contador de bytes en vez de bufferizarlo entero primero: sin
// content-length (o si miente), `res.text()` cargaría en memoria un cuerpo arbitrariamente
// grande antes de poder comprobar MAX_BODY_BYTES (fix 10 de la revisión final). Se aborta
// el stream en cuanto se supera el tope, sin esperar a que termine de llegar.
async function readBodyWithLimit(res: Response): Promise<{ text: string; tooLarge: boolean }> {
  const body = res.body
  if (!body) {
    const text = await res.text()
    return { text, tooLarge: Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES }
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return { text: '', tooLarge: true }
    }
    chunks.push(value)
  }
  return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'), tooLarge: false }
}

export async function importRecipeFromUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<RecipeDraft> {
  if (!isPublicHttpUrl(url)) return { ...emptyDraft(), sourceUrl: url, warnings: ['invalid_url'] }

  let currentUrl = url
  let redirects = 0
  let res: Response
  // redirect: 'manual' para poder validar cada salto antes de seguirlo (si no,
  // el propio fetch seguiría una redirección a un host privado sin que este
  // código llegue a verla). Cada salto tiene su propio tope de tiempo (fix 10):
  // sin él, un origen que nunca responde (o responde adrede muy despacio) cuelga
  // la importación indefinidamente; un fetchImpl que rechaza (red caída, timeout)
  // se traduce en fetch_failed en vez de propagar la excepción.
  for (;;) {
    try {
      res = await fetchImpl(currentUrl, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch {
      return { ...emptyDraft(), sourceUrl: url, warnings: ['fetch_failed'] }
    }
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
  const { text: body, tooLarge } = await readBodyWithLimit(res)
  if (tooLarge) return { ...emptyDraft(), sourceUrl: url, warnings: ['body_too_large'] }
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

function draftWithWarning(warning: RecipeImportWarning): RecipeDraft {
  return { ...emptyDraft(), warnings: [warning] }
}

// Punto único de importación para los tres adaptadores (acción, REST y MCP).
// `deps` solo se usa en los tests, para inyectar un modelo de prueba.
export async function importRecipe(ctx: Ctx, input: z.infer<typeof RecipeImportSchema>, deps: AiTaskDeps = {}): Promise<RecipeDraft> {
  if (input.kind === 'url') return importRecipeFromUrl(input.url)
  if (input.kind === 'text') return importRecipeFromText(input.text, ctx.locale)
  // readImage ya acota el nombre del fichero y el hogar: un uploadId de otro
  // hogar simplemente no se encuentra, sin decir si existe en algún sitio.
  const bytes = await readImage(ctx.householdId, input.uploadId)
  if (!bytes) return draftWithWarning('upload_not_found')
  const result = await aiImportRecipe(ctx, { kind: 'image', bytes: new Uint8Array(bytes), mime: 'image/webp' }, deps)
  if (!result.ok) return draftWithWarning(AI_WARNING[result.code])
  return { ...result.data, warnings: [] }
}
