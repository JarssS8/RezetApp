import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

// Verificación honesta del fix de Tarea 5 (informe de identidad visual): los
// tests de vitest con jsdom comprueban que la clase `pill-selected` aparece en
// el DOM, pero no que gane el color de fondo en un navegador real, que es
// justo donde falló la primera versión (la clase vivía en `@layer components`
// y perdía contra cualquier utilidad de Tailwind sobre la misma propiedad).
// Este spec mide `getComputedStyle` de verdad, en Chromium.
test.describe('patrón de seleccionado', () => {
  test('el filtro de dificultad y la pestaña activa de la barra pintan con el color de acento, no transparente', async ({ page }) => {
    await registerHousehold(page, 'Identidad')
    await page.goto('/recipes')

    // Filtro de dificultad: "Fácil" pasa a seleccionado; "Cualquiera" se
    // queda sin marcar. Si pill-selected no gana, ambos comparten el mismo
    // fondo (el de variant="outline"/"ghost" en reposo).
    const easy = page.getByRole('button', { name: /^fácil$|^easy$/i })
    const any = page.getByRole('button', { name: /^cualquiera$|^any$/i })
    await easy.click()
    await expect(easy).toHaveAttribute('aria-pressed', 'true')
    await expect(any).toHaveAttribute('aria-pressed', 'false')

    const [easyBg, anyBg] = await Promise.all([
      easy.evaluate((el) => getComputedStyle(el).backgroundColor),
      any.evaluate((el) => getComputedStyle(el).backgroundColor),
    ])
    expect(easyBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(easyBg).not.toBe('transparent')
    expect(easyBg).not.toBe(anyBg)

    // Barra inferior: /recipes marca "Recetas" como activa (aria-current);
    // su píldora interna debe tener el mismo tipo de fondo no transparente,
    // distinto del de una pestaña inactiva ("Hoy").
    const activeLink = page.getByRole('link', { name: /^recetas$|^recipes$/i })
    await expect(activeLink).toHaveAttribute('aria-current', 'page')
    const activePill = activeLink.locator('.pill-selected')
    await expect(activePill).toHaveCount(1)

    const idleLink = page.getByRole('link', { name: /^hoy$|^today$/i })
    await expect(idleLink).not.toHaveAttribute('aria-current', 'page')
    const idlePillArea = idleLink.locator('span').first()

    const [activeBg, idleBg] = await Promise.all([
      activePill.evaluate((el) => getComputedStyle(el).backgroundColor),
      idlePillArea.evaluate((el) => getComputedStyle(el).backgroundColor),
    ])
    expect(activeBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(activeBg).not.toBe('transparent')
    expect(activeBg).not.toBe(idleBg)
  })
})
