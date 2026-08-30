import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El marco de la app (ancho máximo, padding, barra inferior) se cede cuando un
// descendiente pide pantalla completa. Se comprueba leyendo el fuente porque
// esas clases son `:has()` de Tailwind sobre un árbol de Server Components:
// montarlo en jsdom no verificaría nada que el CSS compilado no decida ya.
const ROOT = join(import.meta.dirname, '..', '..')
const LAYOUT = readFileSync(join(ROOT, 'app/(app)/layout.tsx'), 'utf8')
const PLAN_PAGE = readFileSync(join(ROOT, 'app/(app)/plan/page.tsx'), 'utf8')

describe('marco de la app', () => {
  it('cede el ancho y el relleno cuando un hijo pide pantalla completa', () => {
    expect(LAYOUT).toContain('has-[[data-fullscreen]]:max-w-none')
    expect(LAYOUT).toContain('has-[[data-fullscreen]]:p-0')
  })

  it('esconde la barra inferior en pantalla completa, sin duplicar el layout', () => {
    expect(LAYOUT).toContain('group-has-[[data-fullscreen]]:hidden')
    // Una sola llamada a la guardia: el informe de identidad avisa de que un
    // layout paralelo duplicaría requireSession() y partiría el árbol de rutas.
    expect(LAYOUT.split('requireSession()').length - 1).toBe(1)
  })

  it('no hay ningún layout paralelo bajo cook', () => {
    expect(existsSync(join(ROOT, 'app/(app)/cook/[entryId]/layout.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'app/(app)/cook/recipe/[id]/layout.tsx'))).toBe(false)
  })

  // Auditoría W7, hallazgo 5.1: WeekView pide `lg:grid-cols-7` dentro de un
  // marco de max-w-xl (576px) — mismo mecanismo que data-fullscreen, marco
  // más ancho solo cuando la propia pantalla lo pide.
  it('ensancha el marco a max-w-5xl cuando /plan pide data-wide', () => {
    expect(LAYOUT).toContain('has-[[data-wide]]:max-w-5xl')
    expect(PLAN_PAGE).toContain('data-wide="true"')
  })
})

// Cada pantalla de (app) se guarda sola. Antes de T11b la guardia del marco
// -`await requireSession()` en el cuerpo de app/(app)/layout.tsx- tapaba a
// quien se olvidara; ahora vive detrás de un <Suspense>, redirige igual pero
// ya no bloquea el árbol, y una página sin guardia se renderiza entera para
// quien no ha entrado (le pasaba a /settings/data). Este contrato cierra la
// clase: o la página llama a una guardia, o es un redirect puro.
function appPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) appPages(full, acc)
    else if (entry.name === 'page.tsx') acc.push(full)
  }
  return acc
}

describe('guardia de sesión de las pantallas de (app)', () => {
  const pages = appPages(join(ROOT, 'app/(app)'))

  it('encuentra todas las pantallas', () => {
    expect(pages.length).toBeGreaterThan(20)
  })

  it.each(pages.map((p) => [p.slice(ROOT.length + 1), p] as const))('%s se guarda sola', (_name, path) => {
    const src = readFileSync(path, 'utf8')
    const guarded = /require(Session|Household|Role)\(/.test(src)
    // Un redirect puro (app/(app)/settings/page.tsx) no pinta nada: no hay
    // nada que enseñar a quien no ha entrado, y el destino sí se guarda.
    const pureRedirect = src.includes('redirect(') && !src.includes('return (')
    expect(guarded || pureRedirect).toBe(true)
  })
})

// Tema, acento e idioma del <html> los escriben dos sitios distintos desde
// T11b, porque el layout raíz ya no puede leer la cookie sin quedarse sin
// armazón: PREFS_BOOT_SCRIPT (antes del pintado, desde la cookie) y
// AppearanceForm (al cambiar el control, sobre el documento). Si uno aprende
// un atributo y el otro no, el usuario ve el cambio hasta que recarga —o al
// revés—. No se puede comprobar que hagan lo mismo sin ejecutarlos, pero sí
// que los dos siguen hablando de los tres atributos y de la regla que más
// fácil se olvida: `system` no pinta data-theme, lo quita.
describe('las dos plumas que escriben el <html>', () => {
  const writers = {
    'lib/prefs.ts (PREFS_BOOT_SCRIPT)': readFileSync(join(ROOT, 'lib/prefs.ts'), 'utf8'),
    'components/settings/appearance-form.tsx': readFileSync(join(ROOT, 'components/settings/appearance-form.tsx'), 'utf8'),
  }

  it.each(Object.entries(writers))('%s escribe acento, tema e idioma', (_name, src) => {
    expect(src).toContain('data-accent')
    expect(src).toContain('data-theme')
    expect(src).toMatch(/\.lang\b/)
  })

  it.each(Object.entries(writers))('%s quita data-theme cuando el tema es del sistema', (_name, src) => {
    expect(src).toContain('removeAttribute')
  })
})
