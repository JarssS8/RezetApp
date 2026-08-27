import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: el servidor de e2e usa la base de datos de
// desarrollo (no se trunca entre ejecuciones), así que evitamos nombres fijos.
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

test.describe('filtro de etiquetas', () => {
  test('filtrar por la etiqueta raíz encuentra la receta de una rama', async ({ page }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Cata'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // Receta con la etiqueta hija "Vegetariano" (seed: dieta > vegetariano).
    const title = uniqueName('Guiso e2e')
    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill(title)
    await page.getByLabel(/ingredientes|ingredients/i).fill('400 g de lentejas')
    await page.getByLabel(/ingredientes|ingredients/i).blur()
    await expect(page.getByText(/reconocido|recognized/i).first()).toBeVisible()
    await page.getByLabel(/^etiquetas$|^tags$/i).fill('Vegetariano')
    await page.getByLabel(/^etiquetas$|^tags$/i).press('Enter')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)

    // El filtro por rama: pulsar la raíz "Dieta" debe seguir enseñando la
    // receta etiquetada con su hija "Vegetariano" (searchRecipes expande el
    // slug de la raíz a toda su descendencia).
    await page.goto('/recipes')
    await page.getByRole('button', { name: /^dieta$|^diet$/i }).click()
    await expect(page).toHaveURL(/tags=dieta/)
    await expect(page.getByText(title)).toBeVisible()
  })
})
