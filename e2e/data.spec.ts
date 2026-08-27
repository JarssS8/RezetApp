import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: mismo motivo que en recipes.spec.ts (base de
// datos de desarrollo compartida entre ejecuciones).
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

test.describe('datos', () => {
  test('exportar recetas descarga un JSON y la sección de importar/migrar está visible', async ({ page }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Cris'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill('Receta e2e datos')
    await page.getByLabel(/ingredientes|ingredients/i).fill('2 huevos')
    await page.getByLabel(/^pasos$|^steps$/i).fill('Bate los huevos')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)

    await page.goto('/settings/data')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /exportar recetas|export recipes/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^recetas-.*\.json$|^recipes-.*\.json$/)

    // La sección de importar y la nota de migración conviven con la exportación.
    await expect(page.getByLabel(/importar recetas|import recipes/i)).toBeVisible()
    await expect(page.getByText(/migrar desde mealie|migrate from mealie/i)).toBeVisible()
  })
})
