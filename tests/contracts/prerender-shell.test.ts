import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guardián del armazón estático (T11b, F3 de la revisión). El build es la
// única prueba de que `requireHousehold()` sigue detrás de un <Suspense> en
// las cinco pantallas: si alguien lo saca de ahí otra vez, la ruta vuelve a
// marcarse `ƒ` y `today.html` sale vacío (0 bytes) mucho antes de que un
// contrato de código fuente pueda notarlo. Este test lee el árbol que deja
// `pnpm build`, así que solo corre cuando ese árbol existe -de ahí el
// `skipIf`- y por eso vive detrás de `check:shell`, no de `pnpm check`.
const ROOT = join(import.meta.dirname, '..', '..')
const APP_DIR = join(ROOT, '.next/server/app')
const SCREENS = ['today', 'cook', 'plan', 'pantry', 'recipes']

// Cadenas hoja de `es` que de verdad delatan el idioma: se descartan las que
// coinciden con su par en `en` (p. ej. "RezetApp" o "Plan", iguales en los
// dos ficheros) porque su presencia en el armazón no prueba nada sobre qué
// idioma horneó el build.
function translatedLeafStrings(es: unknown, en: unknown, acc: string[] = []): string[] {
  if (typeof es === 'string') {
    if (es.trim().length > 3 && es !== en) acc.push(es)
    return acc
  }
  if (es && typeof es === 'object' && en && typeof en === 'object') {
    const enRecord = en as Record<string, unknown>
    for (const [key, value] of Object.entries(es)) translatedLeafStrings(value, enRecord[key], acc)
  }
  return acc
}

const commonEs = JSON.parse(readFileSync(join(ROOT, 'messages/es/common.json'), 'utf8')) as unknown
const commonEn = JSON.parse(readFileSync(join(ROOT, 'messages/en/common.json'), 'utf8')) as unknown
const commonStrings = translatedLeafStrings(commonEs, commonEn)

describe.skipIf(!existsSync(join(APP_DIR, 'today.html')))('armazón estático de las cinco pantallas (contra un build real)', () => {
  it.each(SCREENS)('%s: el HTML prerenderizado no es un cascarón vacío', (screen) => {
    const html = readFileSync(join(APP_DIR, `${screen}.html`), 'utf8')
    expect(html.length).toBeGreaterThan(2000)
  })

  it.each(SCREENS)('%s: el segmento completo trae el armazón, no solo el nodo raíz', (screen) => {
    const rsc = readFileSync(join(APP_DIR, `${screen}.segments/_full.segment.rsc`), 'utf8')
    expect(rsc.length).toBeGreaterThan(8000)
  })

  // El armazón (`_full.segment.rsc`) se sirve a cualquiera antes de saber su
  // idioma: es el mismo fichero de build para todo el mundo (ver el
  // comentario de app/layout.tsx sobre IntlShell). Que una cadena de
  // messages/es/common.json aparezca ahí dentro sería el español de quien
  // hizo el build, horneado para todos los hogares y los dos idiomas.
  it.each(SCREENS)('%s: el armazón compartido no lleva ninguna cadena traducida de common.json', (screen) => {
    const rsc = readFileSync(join(APP_DIR, `${screen}.segments/_full.segment.rsc`), 'utf8')
    for (const s of commonStrings) {
      expect(rsc, `"${s}" (messages/es/common.json) apareció en el armazón de ${screen}`).not.toContain(s)
    }
  })
})
