import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

// Las cinco rutas de la app (AGENTS.md dice ahora "Las cuatro pantallas" —
// Cocinar sigue siendo ruta propia aunque salió de la barra), en los dos temas
// (spec §16). El tema oscuro se emula con prefers-color-scheme porque la
// preferencia por defecto de un usuario recién registrado es `system` y
// app/globals.css la resuelve por media query (`:root:not([data-theme="light"])`).
const SCREENS = ['/today', '/cook', '/plan', '/pantry', '/recipes'] as const

// wcag2a/wcag2aa/wcag21a/wcag21aa: el AA que pide §7. Se deja fuera
// `best-practice`, que no es un requisito y mete ruido (encabezados saltados,
// landmarks opcionales).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad (${colorScheme})`, () => {
    test(`las cinco pantallas pasan axe en tema ${colorScheme}`, async ({ page }) => {
      // reducedMotion: 'reduce' (revisión W7-ola1): sin esto, axe a veces
      // fotografía el color de texto a mitad del fundido de `view-enter`
      // (opacidad parcial, no el color final) y mide un contraste falso que
      // no existe una vez asentada la animación. El interruptor global de
      // movimiento reducido (app/globals.css) colapsa esas transiciones a
      // .01ms, así que axe siempre mide el color ya asentado.
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await registerHousehold(page, 'Axe')

      for (const screen of SCREENS) {
        await page.goto(screen)
        // Esperar a que la pantalla esté pintada de verdad: axe sobre un
        // esqueleto de carga no comprueba nada.
        await expect(page.getByRole('navigation')).toBeVisible()
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
        const summary = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
        expect(summary, `${screen} en tema ${colorScheme}`).toEqual([])
      }
    })
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad de la puerta de entrada (${colorScheme})`, () => {
    test(`login y registro pasan axe en tema ${colorScheme}`, async ({ page }) => {
      // reducedMotion: 'reduce' (revisión W7-ola1): ver el comentario del
      // primer bloque de arriba — mismo motivo, mismo fix.
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      // Sin sesión: son las dos únicas pantallas que se ven sin registrarse, y
      // en W6 estrenan wordmark, lavado de acento y tarjeta con sombra.
      for (const screen of ['/login', '/register']) {
        await page.goto(screen)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
        expect(violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`), `${screen} en tema ${colorScheme}`).toEqual([])
      }
    })
  })
}
