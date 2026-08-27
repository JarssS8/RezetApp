import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: mismo motivo que en auth.spec.ts (base de
// desarrollo compartida entre ejecuciones).
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

// Fecha en aritmética UTC, igual que daysUntil (lib/services/pantry.ts): un
// input[type=date] no aplica zona horaria, así que hay que igualar el día
// calendario que el servidor calculará al comparar con "hoy" en UTC.
function inUtcDays(days: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
  return d.toISOString().slice(0, 10)
}

// Locale fijo a es: la búsqueda de alimentos coincide en es o en (searchFoods
// compara ambas columnas), pero el nombre mostrado depende del locale del
// usuario (resuelto de Accept-Language al registrarse) y el enunciado pide
// buscar "cebolla" y ver "Caduca en 2 días".
test.use({ locale: 'es-ES' })

test.describe('despensa', () => {
  test('alta con caducidad, ajuste rápido, panel de caducidades y borrado', async ({ page }) => {
    const name = uniqueName('Cami')
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(name)
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    await page.goto('/pantry/add')
    await page.getByRole('combobox', { name: /buscar alimento|search food/i }).fill('cebolla')
    await page.getByRole('option', { name: 'cebolla', exact: true }).click()
    await page.getByLabel(/cantidad|quantity/i).fill('500')
    await page.getByRole('button', { name: /nevera|fridge/i }).click()
    await page.getByLabel(/caducidad|expiry date/i).fill(inUtcDays(2))
    await page.getByRole('button', { name: /guardar|save/i }).click()
    await expect(page).toHaveURL(/\/pantry$/)

    await expect(page.getByText('500 g')).toBeVisible()
    const expiryText = page.getByText(/Caduca en 2 días|Expires in 2 days/)
    await expect(expiryText).toBeVisible()
    await expect(expiryText).toHaveClass(/text-warn/)

    await page.getByRole('button', { name: /^(más|increase)$/i }).click()
    await expect(page.getByText('510 g')).toBeVisible()

    await expect(page.getByRole('heading', { name: /caduca pronto|expiring soon/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /qué cocino con lo que caduca|what can i cook with what's expiring/i })).toBeVisible()

    await page.getByRole('button', { name: /quitar|remove/i }).click()
    await expect(page.getByText(/la despensa está vacía|the pantry is empty/i)).toBeVisible()
  })
})
