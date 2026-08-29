import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El marco de la app (ancho máximo, padding, barra inferior) se cede cuando un
// descendiente pide pantalla completa. Se comprueba leyendo el fuente porque el
// layout es un Server Component asíncrono con requireSession(): montarlo en
// jsdom exigiría simular la sesión entera para verificar una clase de CSS.
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
