import { expect, test } from '@playwright/test'
import { registerHousehold, uniqueName } from './helpers/session'

// El registro crea un hogar nuevo por cada usuario (a diferencia del flujo de
// invitación de e2e/auth.spec.ts, donde el segundo entra en el hogar del
// primero): dos registros son dos hogares, que es lo que aquí hace falta.
test.describe('caché por hogar', () => {
  test('la caché de un hogar no se ve desde otro', async ({ browser }) => {
    const a = await browser.newPage()
    await registerHousehold(a, 'Ana')
    const title = uniqueName('Lentejas')
    // Se crea por la REST a propósito: así este test cubre además el camino de
    // escritura que no pasa por ninguna acción de servidor.
    const created = await a.request.post('/api/v1/recipes', {
      data: { title, servingsBase: 2, ingredients: [], steps: [] },
    })
    expect(created.ok()).toBeTruthy()

    // A calienta la caché de /recipes con su receta dentro.
    await a.goto('/recipes')
    await expect(a.getByText(title)).toBeVisible()

    // B entra después, a la misma URL, con la entrada de A ya caliente.
    const b = await browser.newPage()
    await registerHousehold(b, 'Bo')
    await b.goto('/recipes')
    await expect(b.getByText(title)).toHaveCount(0)

    // Y al revés: que B haya pedido la pantalla no le ha quitado la suya a A.
    await a.reload()
    await expect(a.getByText(title)).toBeVisible()
  })

  test('una escritura por REST invalida la pantalla en el acto', async ({ page }) => {
    await registerHousehold(page, 'Cami')
    // Primera visita: la lista queda cacheada, vacía.
    await page.goto('/recipes')
    const title = uniqueName('Sopa')
    await expect(page.getByText(title)).toHaveCount(0)

    // Escritura por la REST -el mismo camino que usa el MCP-: si la
    // invalidación viviera en lib/actions en vez de en lib/services, la
    // recarga siguiente serviría la lista vieja durante toda la vida de la
    // entrada, y este test sería rojo.
    const created = await page.request.post('/api/v1/recipes', {
      data: { title, servingsBase: 2, ingredients: [], steps: [] },
    })
    expect(created.ok()).toBeTruthy()

    await page.reload()
    await expect(page.getByText(title)).toBeVisible()
  })
})
