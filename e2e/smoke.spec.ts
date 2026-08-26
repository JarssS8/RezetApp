import { expect, test } from '@playwright/test'

test('la raíz responde y pinta el tema', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'huerta')
  // Visitante anónimo: (app) exige sesión y redirige a /login (Tarea 22 cubre el flujo autenticado)
  await expect(page).toHaveURL(/\/login$/)
})
