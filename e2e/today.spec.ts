import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

test.describe('hoy', () => {
  test('recién registrado: anillo a cero y enlace al plan; con una comida, la comida', async ({ page }) => {
    await registerHousehold(page, 'Hoy')

    await expect(page.getByRole('img', { name: /0 de 0|0 of 0/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /no hay nada planificado|nothing planned/i })).toBeVisible()

    // Una comida libre en la cena de hoy (mismo camino que e2e/plan.spec.ts)
    await page.goto('/plan')
    const todayHeader = page.locator('div.bg-accent', { hasText: /hoy|today/i })
    const todayColumn = todayHeader.locator('xpath=..')
    await todayColumn.getByRole('button', { name: /^(añadir a cena|add to dinner)$/i }).click()
    await page.getByRole('button', { name: /^(comida libre|free meal)$/i }).click()
    await page.getByLabel(/^(título|title)$/i).fill('Pizza')
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()

    await page.goto('/today')
    await expect(page.getByText('Pizza', { exact: true })).toBeVisible()
    // Comida libre: no hay receta, así que no se ofrece cocinarla. Se acota a
    // <main> porque la pestaña inferior "Cocinar" (bottom-bar.tsx) comparte
    // el mismo nombre accesible y vive fuera de <main> en el layout de (app).
    await expect(page.locator('main').getByRole('link', { name: /^(cocinar|cook)$/i })).toHaveCount(0)
  })
})
