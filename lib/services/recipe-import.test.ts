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

describe('importRecipeFromText', () => {
  it('separa título, ingredientes (líneas con cantidad) y pasos (numerados o tras "Preparación")', () => {
    const d = importRecipeFromText(`Tortilla de patatas\n\nIngredientes\n4 huevos\n500 g de patatas\nsal\n\nPreparación\n1. Pela las patatas.\n2. Bate los huevos.`, 'es')
    expect(d.title).toBe('Tortilla de patatas')
    expect(d.ingredients.map((i) => i.rawText)).toEqual(['4 huevos', '500 g de patatas', 'sal'])
    expect(d.steps.map((s) => s.text)).toEqual(['Pela las patatas.', 'Bate los huevos.'])
  })
})
