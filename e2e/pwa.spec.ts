import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

test.describe('pwa', () => {
  test('el manifiesto y el service worker responden sin sesión', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest')
    expect(manifest.status()).toBe(200)
    expect((await manifest.json()).name).toBe('RezetApp')

    const sw = await request.get('/sw.js')
    expect(sw.status()).toBe(200)
    expect(sw.headers()['content-type']).toMatch(/javascript/)
  })

  test('ajustes de notificaciones se ve con sesión', async ({ page }) => {
    const name = uniqueName('Cata')
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(name)
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    await page.goto('/settings/notifications')
    await expect(page.getByRole('heading', { name: /notificaciones|notifications/i })).toBeVisible()

    // Chromium en CI puede no traer PushManager utilizable (headless shell sin
    // GCM/soporte real de push) o denegar el permiso de notificaciones por
    // política del propio navegador headless: se acepta cualquiera de las tres
    // ramas que ofrece el panel, con tal de que enseñe una de ellas.
    const enableButton = page.getByRole('button', { name: /activar en este dispositivo|enable on this device/i })
    const unsupported = page.getByText(/este navegador no admite notificaciones push|this browser does not support push notifications/i)
    const denied = page.getByText(/has bloqueado las notificaciones|you have blocked notifications/i)
    await expect(enableButton.or(unsupported).or(denied)).toBeVisible()
  })
})
