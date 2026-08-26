import { expect, test } from '@playwright/test'

test('la raíz responde y pinta el tema', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'huerta')
  await expect(page).toHaveURL(/\/today$/)
})
