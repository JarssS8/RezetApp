import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: el servidor de e2e usa la base de datos de
// desarrollo (no se trunca entre ejecuciones), así que evitamos nombres fijos.
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

test.describe('plan', () => {
  test('comida libre en Cena de hoy: chip, saltar, propuestas vacías y punto en el mes', async ({ page }) => {
    const name = uniqueName('Cata')
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(name)
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // No hay endpoint de recetas todavía (llega en W3): la alternativa del
    // plan de la tarea es crear la entrada como "comida libre" desde el "+"
    // de la columna de hoy. La cabecera de la columna de hoy se distingue de
    // las demás por el fondo `bg-accent` que le pone `isToday` (day-column.tsx).
    // El locale efectivo (es/en) depende del Accept-Language del navegador de
    // prueba, así que los textos se buscan con expresiones bilingües (mismo
    // patrón que auth.spec.ts).
    await page.goto('/plan')
    const todayHeader = page.locator('div.bg-accent', { hasText: /hoy|today/i })
    await expect(todayHeader).toBeVisible()
    const todayColumn = todayHeader.locator('xpath=..')

    await todayColumn.getByRole('button', { name: /^(añadir a cena|add to dinner)$/i }).click()
    await page.getByRole('button', { name: /^(comida libre|free meal)$/i }).click()
    await page.getByLabel(/^(título|title)$/i).fill('Pizza')
    // Las raciones ya arrancan en el valor por defecto del hogar (2): no hace
    // falta tocar el contador (arrastrar no se prueba en e2e, es frágil).
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()

    const chip = todayColumn.getByText('Pizza', { exact: true })
    await expect(chip).toBeVisible()

    // Anclado: el chip vive dentro de un contenedor arrastrable (dnd-kit) cuyo
    // nombre accesible, al no tener aria-label propio, se calcula concatenando
    // el de sus botones internos ("… Skip …"); sin anclar, la búsqueda por rol
    // también encontraría ese contenedor en vez del botón real.
    await todayColumn.getByRole('button', { name: /^(saltar|skip)$/i }).click()
    await expect(chip).toHaveClass(/line-through/)

    await page.goto('/plan/proposals')
    await expect(page.getByText(/no hay propuestas|no proposals yet/i)).toBeVisible()

    // La vista mensual marca el día de hoy con `border-primary` (month-view.tsx)
    // y pinta un punto por hueco ocupado, saltado o no.
    await page.goto('/plan/month')
    const todayCell = page.locator('a.border-primary')
    await expect(todayCell).toBeVisible()
    await expect(todayCell.getByTestId('meal-dot')).toHaveCount(1)
  })
})
