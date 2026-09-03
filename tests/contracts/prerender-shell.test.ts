import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guardián del armazón estático (T11b, F3 de la revisión; medido de nuevo en
// el fix 3 de la revisión final de W10). El build es la única prueba de que
// `requireHousehold()` sigue detrás de un <Suspense> en las cinco pantallas:
// si alguien lo saca de ahí otra vez, la ruta vuelve a marcarse `ƒ` y el
// armazón compartido deja de llevar el esqueleto de carga (`Skeleton`,
// components/ui/skeleton.tsx) que demuestra que el <Suspense> se resolvió
// durante el prerenderizado, no en cada petición. Este test lee el árbol que
// deja `pnpm build`, así que solo corre cuando ese árbol existe -de ahí el
// `skipIf`- y por eso vive detrás de `check:shell`, no de `pnpm check`.
const ROOT = join(import.meta.dirname, '..', '..')
const APP_DIR = join(ROOT, '.next/server/app')
const SCREENS = ['today', 'cook', 'plan', 'pantry', 'recipes']

// Cuenta cuántas veces aparece el marcador de un data-slot concreto en el RSC
// serializado del segmento. Cada <Skeleton> deja `"data-slot":"skeleton"` en
// el flight payload -sin espacios ni comillas de HTML-, así que contar la
// cadena literal es más fiable (y más barato) que parsear el formato interno
// de React para cada build.
function countSlot(rsc: string, slot: string): number {
  return (rsc.match(new RegExp(`"data-slot":"${slot}"`, 'g')) ?? []).length
}

// Umbral medido contra un build real (fix 3 de la revisión final: today 10,
// cook 6, plan 16, pantry 14, recipes 18). El mínimo se queda muy por debajo
// de lo medido -con margen de sobra para que un cambio de diseño legítimo no
// rompa el guardián- pero perder el esqueleto entero (volver a `ƒ`, o un
// <Suspense> que deja de resolverse en el servidor) sí lo hace saltar: cero
// marcadores no pasa ningún umbral de la tabla.
const MIN_SKELETON_MARKERS: Record<string, number> = { today: 4, cook: 4, plan: 4, pantry: 4, recipes: 4 }

// Cadenas hoja de un namespace que de verdad delatan el idioma: se descartan
// las que coinciden con su par en `en` (p. ej. "RezetApp" o "Plan", iguales en
// los dos ficheros) porque su presencia en el armazón no prueba nada sobre
// qué idioma horneó el build.
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

// Los 9 namespaces de i18n, no solo common.json: el armazón compartido puede
// arrastrar la cadena de cualquiera de ellos si algo la evalúa fuera de
// IntlShell (p. ej. un valor por defecto calculado en el servidor en vez de
// en el cliente).
const readJson = (file: string) => JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as unknown
const NAMESPACES = readdirSync(join(ROOT, 'messages/es')).filter((f) => f.endsWith('.json'))
const leakCheckStrings: [namespace: string, strings: string[]][] = NAMESPACES.map((file) => [
  file.replace(/\.json$/, ''),
  translatedLeafStrings(readJson(`messages/es/${file}`), readJson(`messages/en/${file}`)),
])

describe.skipIf(!existsSync(APP_DIR))('armazón estático de las cinco pantallas (contra un build real)', () => {
  it('las cinco páginas prerenderizadas existen', () => {
    for (const screen of SCREENS) expect(existsSync(join(APP_DIR, `${screen}.html`)), screen).toBe(true)
  })

  it.each(SCREENS)('%s: el segmento completo trae marcadores de esqueleto de sobra', (screen) => {
    const rsc = readFileSync(join(APP_DIR, `${screen}.segments/_full.segment.rsc`), 'utf8')
    expect(countSlot(rsc, 'skeleton')).toBeGreaterThanOrEqual(MIN_SKELETON_MARKERS[screen] as number)
  })

  it('el contador discrimina: un data-slot inventado da cero', () => {
    // Si esto no diera 0, countSlot estaría mal -contaría cualquier cosa- y
    // el umbral de arriba no probaría nada sobre el esqueleto real.
    const rsc = readFileSync(join(APP_DIR, 'today.segments/_full.segment.rsc'), 'utf8')
    expect(countSlot(rsc, 'tokens')).toBe(0)
  })

  // El armazón (`_full.segment.rsc`) se sirve a cualquiera antes de saber su
  // idioma: es el mismo fichero de build para todo el mundo (ver el
  // comentario de IntlShell sobre 'use cache: private'). Que una cadena de
  // cualquiera de los 9 namespaces de messages/es apareciera ahí dentro sería
  // el español de quien hizo el build, horneado para todos los hogares y los
  // dos idiomas.
  for (const [namespace, strings] of leakCheckStrings) {
    it.each(SCREENS)(`%s: el armazón compartido no lleva ninguna cadena traducida de ${namespace}.json`, (screen) => {
      const rsc = readFileSync(join(APP_DIR, `${screen}.segments/_full.segment.rsc`), 'utf8')
      for (const s of strings) {
        expect(rsc, `"${s}" (messages/es/${namespace}.json) apareció en el armazón de ${screen}`).not.toContain(s)
      }
    })
  }
})
