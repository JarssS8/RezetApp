import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

test.describe('plan', () => {
  test('comida libre en Cena de hoy: chip, saltar, propuestas vacías y punto en el mes', async ({ page }) => {
    await registerHousehold(page, 'Cata')

    // Este caso planifica una COMIDA LIBRE (sin receta) a propósito: es la
    // rama que ningún otro spec toca. El plan con una receta de verdad,
    // cocinarla y la compra que sale de ahí están en e2e/loop.spec.ts.
    // La cabecera de la columna de hoy lleva `data-testid="today-column"`
    // (day-column.tsx), puesto por `isToday`.
    // El locale efectivo (es/en) depende del Accept-Language del navegador de
    // prueba, así que los textos se buscan con expresiones bilingües (mismo
    // patrón que auth.spec.ts).
    await page.goto('/plan')
    const todayHeader = page.getByTestId('today-column')
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

    // La comida libre no tiene receta ni ingredientes: el resumen de compra
    // de la semana está vacío. Sin SHOPLIST_* en el entorno de e2e, tampoco
    // hay botón de envío (ni con líneas lo habría: nada que consolidar).
    await page.goto('/plan/shopping')
    await expect(page.getByText(/no hace falta comprar nada para este rango|nothing to buy for this range/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^(enviar a shoplist|send to shoplist)$/i })).toHaveCount(0)
  })
})
