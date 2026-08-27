import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

// Igual que cook.spec.ts: el nombre de alimento que muestra FoodPicker
// depende del locale del usuario (resuelto de Accept-Language al
// registrarse), y aquí se planifica y cocina esa misma receta.
test.use({ locale: 'es-ES' })

test.describe('estadísticas del plan', () => {
  test('receta planificada y cocinada hoy: /plan/stats la cuenta', async ({ page }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Estadístico'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // 1) Receta
    const title = uniqueName('Sopa')
    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill(title)
    await page.getByLabel(/ingredientes|ingredients/i).fill('300 g de cebolla')
    await page.getByLabel(/ingredientes|ingredients/i).blur()
    await expect(page.getByText(/reconocido|recognized/i).first()).toBeVisible()
    await page.getByLabel(/^pasos$|^steps$/i).fill('Pocha la cebolla 20 minutos')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)

    // 2) Despensa con cebolla de sobra: sin esto logCooked avisaría de que
    // falta y el diálogo de "terminar" no llegaría a redirigir (mismo motivo
    // que en cook.spec.ts).
    await page.goto('/pantry/add')
    await page.getByRole('combobox', { name: /buscar alimento|search food/i }).fill('cebolla')
    await page.getByRole('option', { name: 'cebolla', exact: true }).click()
    await page.getByLabel(/cantidad|quantity/i).fill('1000')
    await page.getByRole('button', { name: /guardar|save/i }).click()
    await expect(page).toHaveURL(/\/pantry$/)

    // 3) Planificarla hoy, en la cena, desde el "+" de la columna de hoy
    // (mismo patrón que plan.spec.ts para localizar esa columna).
    await page.goto('/plan')
    const todayHeader = page.locator('div.bg-accent', { hasText: /hoy|today/i })
    await expect(todayHeader).toBeVisible()
    const todayColumn = todayHeader.locator('xpath=..')

    await todayColumn.getByRole('button', { name: /^(añadir a cena|add to dinner)$/i }).click()
    await page.getByPlaceholder(/buscar receta|search recipe/i).fill(title)
    await page.getByRole('button', { name: title, exact: true }).click()
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()
    await expect(todayColumn.getByText(title, { exact: true })).toBeVisible()

    // 4) Cocinarla desde /cook/<entryId>, con el enlace del propio chip
    await todayColumn.getByRole('link', { name: /^(cocinar|cook)$/i }).click()
    await expect(page).toHaveURL(/\/cook\/[0-9a-f-]{36}$/)
    await page.getByRole('button', { name: /he terminado|i'm done/i }).click()
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // 5) Plan y realidad: una cocinada y una adherencia (no null)
    await page.goto('/plan/stats')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/plan y realidad|plan vs reality/i)
    const cookedCard = page.getByText(/^(cocinadas|cooked)$/i).locator('xpath=..')
    await expect(cookedCard.getByText('1', { exact: true })).toBeVisible()
    await expect(page.getByText(/\d+\s*%/)).toBeVisible()
  })
})
