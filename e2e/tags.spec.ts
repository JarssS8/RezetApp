import { expect, test } from '@playwright/test'
import { registerHousehold, uniqueName } from './helpers/session'

test.describe('filtro de etiquetas', () => {
  test('filtrar por la etiqueta raíz encuentra la receta de una rama', async ({ page }) => {
    await registerHousehold(page, 'Cata')

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

    // Guardar ese filtro como colección y comprobar que sobrevive a recargar
    // la lista y que lleva de vuelta a la misma búsqueda.
    await page.getByRole('button', { name: /guardar filtro|save filter/i }).click()
    await page.getByLabel(/nombre de la colección|collection name/i).fill('Vegetarianas')
    await page.getByRole('button', { name: /^guardar$|^save$/i }).click()
    await expect(page.getByRole('link', { name: 'Vegetarianas' })).toBeVisible()

    await page.goto('/recipes')
    await page.getByRole('link', { name: 'Vegetarianas' }).click()
    await expect(page).toHaveURL(/tags=dieta/)
    await expect(page.getByText(title)).toBeVisible()
  })
})
