import { expect, test } from '@playwright/test'
import { registerHousehold, uniqueName } from './helpers/session'

// Locale fijo a es, igual que cook.spec.ts y pantry.spec.ts: el nombre del
// alimento que enseñan FoodPicker y el resumen de compra depende del locale
// del usuario (resuelto de Accept-Language al registrarse) y este caso busca
// "cebolla" y "lentejas".
test.use({ locale: 'es-ES' })

// El bucle de docs/07-ROADMAP.md fase 4, de principio a fin y en una sola
// sesión: receta -> despensa -> plan -> Hoy -> cocinar -> la despensa baja ->
// la compra sabe lo que falta. Sin proveedor de IA configurado (regla 3 de
// AGENTS.md): todo lo que se toca aquí funciona sin ella.
test.describe('el bucle', () => {
  test('receta, despensa, plan, cocinar y compra', async ({ page }) => {
    await registerHousehold(page, 'Bucle')
    const title = uniqueName('Lentejas')

    // 1) Una receta con dos ingredientes que el seed reconoce: uno lo habrá
    //    en la despensa (cebolla) y el otro no (lentejas), para que la compra
    //    tenga algo que decir.
    await page.goto('/recipes/new')
    await page.getByLabel(/^título|^title/i).fill(title)
    await page.getByLabel(/ingredientes|ingredients/i).fill('400 g de lentejas\n300 g de cebolla')
    await page.getByLabel(/ingredientes|ingredients/i).blur()
    await expect(page.getByText(/reconocido|recognized/i).first()).toBeVisible()
    await page.getByLabel(/^pasos$|^steps$/i).fill('Cuece las lentejas 45 minutos')
    await page.getByRole('button', { name: /guardar receta|save recipe/i }).click()
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)

    // 2) Escalar no cambia las kcal por ración (regla dura de AGENTS.md).
    const kcalBefore = await page.getByTestId('kcal-per-serving').textContent()
    await page.getByRole('button', { name: /más raciones|more servings/i }).click()
    await expect(page.getByTestId('kcal-per-serving')).toHaveText(kcalBefore ?? '')

    // 3) Un kilo de cebolla en la despensa.
    await page.goto('/pantry/add')
    await page.getByRole('combobox', { name: /buscar alimento|search food/i }).fill('cebolla')
    await page.getByRole('option', { name: 'cebolla', exact: true }).click()
    await page.getByLabel(/cantidad|quantity/i).fill('1000')
    await page.getByRole('button', { name: /guardar|save/i }).click()
    await expect(page).toHaveURL(/\/pantry$/)
    await expect(page.getByText(/1 kg|1000 g/)).toBeVisible()

    // 4) La receta, en la cena de hoy. La cabecera de la columna de hoy se
    //    distingue por el fondo `bg-accent` que le pone `isToday`.
    await page.goto('/plan')
    const todayHeader = page.locator('div.bg-accent', { hasText: /hoy|today/i })
    await expect(todayHeader).toBeVisible()
    const todayColumn = todayHeader.locator('xpath=..')
    await todayColumn.getByRole('button', { name: /^(añadir a cena|add to dinner)$/i }).click()
    await page.getByPlaceholder(/buscar receta|search recipe/i).fill(title)
    await page.getByRole('button', { name: title }).click()
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()
    await expect(todayColumn.getByText(title, { exact: true })).toBeVisible()

    // 5) La compra de la semana: faltan las lentejas, la cebolla ya la hay.
    await page.goto('/plan/shopping')
    await expect(page.getByText(/lenteja/i).first()).toBeVisible()
    await expect(page.getByText(/^cebolla$/i)).toHaveCount(0)
    // Sin SHOPLIST_* en el entorno de e2e no hay botón de envío: la compra es
    // de ShopList, y sin configurar no se ofrece (regla 5 de AGENTS.md).
    await expect(page.getByRole('button', { name: /^(enviar a shoplist|send to shoplist)$/i })).toHaveCount(0)

    // 6) Hoy enseña la comida y ofrece cocinarla.
    await page.goto('/today')
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await page.locator('main').getByRole('link', { name: /^(cocinar|cook)$/i }).first().click()
    await expect(page).toHaveURL(/\/cook\/[0-9a-f-]{36}$/)
    await expect(page.getByText(/Cuece las lentejas/)).toBeVisible()

    // 7) Cocinado: la despensa baja sola (el descuento es del servidor). Las
    //    lentejas no estaban en la despensa, así que el diálogo avisa del
    //    faltante en vez de cerrarse solo (el aviso no bloquea el guardado,
    //    pero tampoco se descarta sin que el usuario lo vea).
    await page.getByRole('button', { name: /he terminado|i'm done/i }).click()
    await page.getByRole('button', { name: /^(guardar|save)$/i }).click()
    await expect(page.getByText(/faltaron 400 g|missing 400 g/i)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /^(cerrar|close)$/i }).first().click()
    await page.goto('/today')
    await page.goto('/pantry')
    await expect(page.getByText(/700 g/)).toBeVisible()

    // 8) Y el plan lo sabe: la entrada queda marcada como cocinada.
    await page.goto('/plan')
    await expect(page.locator('[data-status="cooked"]').first()).toBeVisible()
  })
})
