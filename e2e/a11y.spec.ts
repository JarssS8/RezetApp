import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

// Las cinco pantallas de AGENTS.md ("Las cinco pantallas"), en los dos temas
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
      await page.emulateMedia({ colorScheme })
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
