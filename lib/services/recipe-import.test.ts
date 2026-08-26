import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importRecipeFromText, importRecipeFromUrl } from './recipe-import'

const html = (f: string) => readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), 'utf8')
const fetchHtml = (body: string): typeof fetch => (async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch

describe('importRecipeFromUrl', () => {
  it('lee schema.org/Recipe en JSON-LD (incl. @graph) y normaliza ingredientes, pasos, raciones, tiempos e imagen', async () => {
    const d = await importRecipeFromUrl('https://ejemplo.test/lentejas', fetchHtml(html('recipe-jsonld.html')))
    expect(d.title).toBe('Lentejas con chorizo')
    expect(d.servingsBase).toBe(4)
    expect(d.prepMinutes).toBe(15)
    expect(d.cookMinutes).toBe(45)
    expect(d.ingredients.map((i) => i.rawText)).toEqual(['400 g de lentejas pardinas', '1 chorizo', 'sal al gusto'])
    expect(d.steps.map((s) => s.text)).toEqual(['Lava las lentejas.', 'Cuece 45 minutos.'])
    expect(d.imageUrls).toEqual(['https://ejemplo.test/lentejas.jpg'])
    expect(d.sourceUrl).toBe('https://ejemplo.test/lentejas')
    expect(d.warnings).toEqual([])
  })
  it('cae a microdata itemprop cuando no hay JSON-LD', async () => {
    const d = await importRecipeFromUrl('https://ejemplo.test/x', fetchHtml(html('recipe-microdata.html')))
    expect(d.title).toBe('Gazpacho')
    expect(d.ingredients.length).toBe(4)
  })
  it('sin receta reconocible devuelve borrador vacío con aviso', async () => {
    const d = await importRecipeFromUrl('https://ejemplo.test/nada', fetchHtml('<html><body>hola</body></html>'))
    expect(d.title).toBe('')
    expect(d.warnings).toContain('no_recipe_found')
  })
  it('rechaza esquemas que no sean http(s) sin llegar a llamar a fetch', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response('', { status: 200 })
    }) as unknown as typeof fetch
    const d = await importRecipeFromUrl('file:///etc/passwd', fetchImpl)
    expect(called).toBe(false)
    expect(d.warnings).toContain('invalid_url')
  })
})

// W2-R15 (SSRF): la importación por URL no debe llegar nunca a llamar a fetch
// contra un host privado o reservado, y debe validar también los saltos de
// redirección (el servidor remoto podría redirigir a un host interno).
describe('importRecipeFromUrl bloquea hosts privados/reservados (SSRF)', () => {
  const blockedHosts = [
    'http://localhost/x',
    'http://sub.local/x',
    'http://127.0.0.1/x',
    'http://127.55.66.77/x',
    'http://[::1]/x',
    'http://10.1.2.3/x',
    'http://172.20.5.6/x',
    'http://192.168.0.5/x',
    'http://169.254.1.1/x',
    'http://[fe80::1]/x',
    'http://[fc00::1]/x',
    'http://[fd12:3456::1]/x',
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:192.168.1.5]/x',
    'http://0.0.0.0/x',
  ]
  it.each(blockedHosts)('%s se rechaza sin llamar a fetch', async (url) => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response('', { status: 200 })
    }) as unknown as typeof fetch
    const d = await importRecipeFromUrl(url, fetchImpl)
    expect(called).toBe(false)
    expect(d.warnings).toContain('invalid_url')
  })
  it('no bloquea un host público con literal IPv6', async () => {
    const d = await importRecipeFromUrl('http://[2001:4860:4860::8888]/x', fetchHtml('<html><body>hola</body></html>'))
    expect(d.warnings).not.toContain('invalid_url')
  })
  it('rechaza una redirección hacia un host privado sin seguirla', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secreto' } })
    }) as unknown as typeof fetch
    const d = await importRecipeFromUrl('https://ejemplo.test/origen', fetchImpl)
    expect(d.warnings).toContain('invalid_url')
    expect(calls).toBe(1)
  })
  it('sigue una redirección pública→pública y parsea el destino', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const requested = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (requested === 'https://ejemplo.test/origen') {
        return new Response(null, { status: 302, headers: { location: 'https://ejemplo.test/destino' } })
      }
      return new Response(html('recipe-jsonld.html'), { status: 200, headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch
    const d = await importRecipeFromUrl('https://ejemplo.test/origen', fetchImpl)
    expect(d.title).toBe('Lentejas con chorizo')
    expect(d.sourceUrl).toBe('https://ejemplo.test/origen')
  })
  it('corta tras más de 3 saltos de redirección', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response(null, { status: 302, headers: { location: `https://ejemplo.test/hop${calls}` } })
    }) as unknown as typeof fetch
    const d = await importRecipeFromUrl('https://ejemplo.test/hop0', fetchImpl)
    expect(d.warnings).toContain('fetch_failed')
    expect(calls).toBe(4)
  })
})

describe('importRecipeFromText', () => {
  it('separa título, ingredientes (líneas con cantidad) y pasos (numerados o tras "Preparación")', () => {
    const d = importRecipeFromText(`Tortilla de patatas\n\nIngredientes\n4 huevos\n500 g de patatas\nsal\n\nPreparación\n1. Pela las patatas.\n2. Bate los huevos.`, 'es')
    expect(d.title).toBe('Tortilla de patatas')
    expect(d.ingredients.map((i) => i.rawText)).toEqual(['4 huevos', '500 g de patatas', 'sal'])
    expect(d.steps.map((s) => s.text)).toEqual(['Pela las patatas.', 'Bate los huevos.'])
  })
})
