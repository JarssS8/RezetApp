import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: el servidor de e2e usa la base de datos de
// desarrollo (no se trunca entre ejecuciones), así que evitamos nombres fijos.
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

test.describe('recetas', () => {
  test('crear receta, ver escalado y nutrición, editar y borrar', async ({ page }) => {
    // registro
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Ana'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill('Lentejas e2e')
    // El navegador de e2e negocia su propio idioma (Accept-Language) contra
    // resolveLocale (lib/i18n/messages.ts): puede resolver a 'es' o a 'en'
    // según el entorno, así que cada texto de interfaz se busca en ambos.
    await page.getByLabel(/ingredientes|ingredients/i).fill('400 g de lentejas\n1 cebolla\n1 cdta de sal')
    await page.getByLabel(/ingredientes|ingredients/i).blur()
    await expect(page.getByText(/reconocido|recognized/i).first()).toBeVisible()
    await page.getByLabel(/^pasos$|^steps$/i).fill('Cuece 45 minutos')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lentejas e2e')
    await expect(page.getByText(/kcal por ración|kcal per serving/i)).toBeVisible()
    const kcalBefore = await page.getByTestId('kcal-per-serving').textContent()
    await page.getByRole('button', { name: /más raciones|more servings/i }).click()
    await expect(page.getByTestId('kcal-per-serving')).toHaveText(kcalBefore ?? '')
    // El aviso "no escala linealmente" del icono de la sal vive en un <title>
    // de SVG (accesible, pero invisible para Playwright); la nota en ámbar
    // que sí es texto visible es la comprobación real de que se detectó como
    // ingrediente no lineal.
    await expect(page.getByText(/ámbar|amber/i).first()).toBeVisible()
    await page.getByRole('link', { name: /editar|edit/i }).click()
    await page.getByLabel(/^título|^title/i).fill('Lentejas e2e v2')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lentejas e2e v2')
    await page.getByRole('button', { name: /eliminar|delete/i }).click()
    // El diálogo de confirmación repite la misma etiqueta que el botón que
    // lo abre ("Eliminar"/"Delete", common.actions.delete —
    // recipe-detail.test.tsx ya fija ese contrato-), así que se acota al
    // diálogo para no pulsar otra vez el disparador.
    await page.getByRole('dialog').getByRole('button', { name: /eliminar|delete/i }).click()
    await expect(page).toHaveURL(/\/recipes$/)
  })

  test('importar desde texto abre el editor con el borrador', async ({ page }) => {
    // registro
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Bea'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    await page.goto('/recipes/import')
    await page.getByRole('button', { name: /desde texto|from text/i }).click()
    await page
      .getByLabel(/pega la receta|paste the recipe/i)
      .fill('Lentejas e2e importadas\n\nIngredientes\n400 g de lentejas\n1 cebolla\n1 cdta de sal\n\nPreparación\nCuece 45 minutos')
    await page.getByRole('button', { name: /^importar$|^import$/i }).click()
    await expect(page).toHaveURL(/\/recipes\/new\?draft=1$/)
    await expect(page.getByLabel(/^título|^title/i)).toHaveValue('Lentejas e2e importadas')
  })
})
