import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

// Locale fijo a es: igual que pantry.spec.ts, el nombre de alimento que
// muestra FoodPicker depende del locale del usuario (resuelto de
// Accept-Language al registrarse), y el enunciado pide encontrar "cebolla".
test.use({ locale: 'es-ES' })

test.describe('cocinar', () => {
  test('receta → modo cocina → cocinado: la despensa baja', async ({ page }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Cocinero'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // 1) Receta con un ingrediente resoluble contra el seed de alimentos
    const title = uniqueName('Sopa')
    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill(title)
    await page.getByLabel(/ingredientes|ingredients/i).fill('300 g de cebolla')
    await page.getByLabel(/ingredientes|ingredients/i).blur()
    await expect(page.getByText(/reconocido|recognized/i).first()).toBeVisible()
    await page.getByLabel(/^pasos$|^steps$/i).fill('Pocha la cebolla 20 minutos')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)

    // 2) Despensa con 1 kg de cebolla
    await page.goto('/pantry/add')
    await page.getByRole('combobox', { name: /buscar alimento|search food/i }).fill('cebolla')
    await page.getByRole('option', { name: 'cebolla', exact: true }).click()
    await page.getByLabel(/cantidad|quantity/i).fill('1000')
    await page.getByRole('button', { name: /guardar|save/i }).click()
    await expect(page).toHaveURL(/\/pantry$/)
    await expect(page.getByText(/1 kg|1000 g/)).toBeVisible()

    // 3) Cocinar la receta directamente (sin hueco en el plan)
    await page.goto('/recipes')
    await page.getByRole('link', { name: title }).click()
    // Acotado a <main>: la barra inferior tiene su propio enlace "Cocinar"
    // (a /cook) con el mismo nombre accesible que el de la ficha (a
    // /cook/recipe/[id]) — sin acotar, el locator es ambiguo.
    await page.locator('main').getByRole('link', { name: /^(cocinar|cook)$/i }).click()
    await expect(page.getByText(/Pocha la cebolla/)).toBeVisible()
    await page.getByRole('button', { name: /he terminado|i'm done/i }).click()
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // 4) El bucle: la despensa ha bajado
    await page.goto('/pantry')
    await expect(page.getByText(/700 g/)).toBeVisible()
  })

  test('el modo cocina cuenta atrás y se puede poner en modo pared', async ({ page }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Cocinero'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    const title = uniqueName('Sopa')
    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill(title)
    await page.getByLabel(/ingredientes|ingredients/i).fill('300 g de cebolla')
    await page.getByLabel(/ingredientes|ingredients/i).blur()
    await expect(page.getByText(/reconocido|recognized/i).first()).toBeVisible()
    await page.getByLabel(/^pasos$|^steps$/i).fill('Pocha la cebolla 20 minutos')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)

    await page.locator('main').getByRole('link', { name: /^(cocinar|cook)$/i }).click()
    await expect(page.getByText(/Pocha la cebolla/)).toBeVisible()

    await page.getByRole('button', { name: /min$/ }).first().click()
    await expect(page.getByRole('status').first()).toContainText(/\d\d:\d\d/)
    await page.getByRole('button', { name: /modo pared/i }).click()
    await expect(page.getByTestId('cook-step')).toHaveClass(/text-4xl/)
  })
})
