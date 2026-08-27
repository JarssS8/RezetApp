import { expect, test } from '@playwright/test'
import { registerHousehold } from './helpers/session'

test.describe('ajustes', () => {
  test('recorre apariencia, hogar, tokens, miembros, passkeys y cierre de sesión', async ({ page, request }) => {
    await registerHousehold(page, 'Cata')

    // Apariencia: acento "miel" y tema "Noche suave" se reflejan en <html>.
    await page.goto('/settings/appearance')
    await page.getByRole('radio', { name: /miel|honey/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'miel')
    await page.getByRole('button', { name: /noche suave|soft dark/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // Hogar: cambiar raciones por defecto a 3 y comprobar que se guarda.
    await page.goto('/settings/household')
    await page.locator('#household-servings').fill('3')
    await page.getByRole('button', { name: /^guardar$|^save$/i }).click()
    await expect(page.getByText(/^guardado$|^saved$/i)).toBeVisible()
    await expect(page.locator('#household-servings')).toHaveValue('3')

    // Tokens: crear uno con el permiso "recipes:read" y comprobar el prefijo rz_.
    await page.goto('/settings/tokens')
    await page.getByRole('button', { name: /crear token|create token/i }).click()
    const tokenDialog = page.getByRole('dialog')
    await tokenDialog.getByLabel(/^nombre$|^name$/i).fill('token e2e')
    await tokenDialog.getByLabel(/leer recetas|read recipes/i).check()
    await tokenDialog.getByRole('button', { name: /crear token|create token/i }).click()
    const tokenCode = tokenDialog.locator('code')
    await expect(tokenCode).toBeVisible()
    const token = (await tokenCode.innerText()).trim()
    expect(token.startsWith('rz_')).toBe(true)
    // El diálogo tiene dos cierres (la X y el botón del pie): se escoge el del pie por texto.
    await tokenDialog.locator('[data-slot="dialog-footer"]').getByRole('button', { name: /^cerrar$|^close$/i }).click()

    // El token solo tiene recipes:read: la ficha del hogar exige household:read → 403.
    const withToken = await page.request.get('/api/v1/household', { headers: { authorization: `Bearer ${token}` } })
    expect(withToken.status()).toBe(403)
    // request (fixture) no comparte cookies con el navegador logueado: sin
    // cabecera Authorization ni sesión, la API exige autenticación → 401.
    const withoutToken = await request.get('/api/v1/household')
    expect(withoutToken.status()).toBe(401)

    // Miembros: "Invitar" genera y muestra una URL de invitación.
    await page.goto('/settings/members')
    await page.getByRole('button', { name: /^invitar$|^invite$/i }).click()
    const inviteDialog = page.getByRole('dialog')
    const inviteCode = inviteDialog.locator('code')
    await expect(inviteCode).toBeVisible()
    await expect(inviteCode).toContainText('/invite/')
    await inviteDialog.locator('[data-slot="dialog-footer"]').getByRole('button', { name: /^cerrar$|^close$/i }).click()

    // Passkeys: la cuenta recién creada tiene exactamente una.
    await page.goto('/settings/passkeys')
    await expect(page.locator('section ul > li')).toHaveCount(1)

    // Cerrar sesión vuelve a /login.
    await page.getByRole('button', { name: /cerrar sesión|log out/i }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
