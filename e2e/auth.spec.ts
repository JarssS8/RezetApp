import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: el servidor de e2e usa la base de datos de
// desarrollo (no se trunca entre ejecuciones), así que evitamos nombres fijos.
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

test.describe('passkeys', () => {
  test('registro crea hogar y entra en Hoy', async ({ page }) => {
    const name = uniqueName('Ana')
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(name)
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('login con credencial descubrible', async ({ page }) => {
    const name = uniqueName('Bo')
    const { cdp, authenticatorId } = await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(name)
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)
    await page.request.post('/api/auth/logout')
    await page.goto('/login')
    await page.getByTestId('login-button').click()
    await expect(page).toHaveURL(/\/today$/)
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
    expect(credentials.length).toBe(1)
  })

  test('invitación: segunda persona entra como miembro', async ({ browser }) => {
    const ownerName = uniqueName('Ana')
    const guestName = uniqueName('Bo')
    const owner = await browser.newPage()
    await enableVirtualAuthenticator(owner)
    await owner.goto('/register')
    await owner.getByLabel(/nombre|name/i).fill(ownerName)
    await owner.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(owner).toHaveURL(/\/today$/)
    // Crear invitación por la API interna (la UI de ajustes llega en W2)
    const res = await owner.request.post('/api/v1/household/invites')
    expect(res.ok()).toBeTruthy()
    const { url } = (await res.json()) as { url: string }

    const guest = await browser.newPage()
    await enableVirtualAuthenticator(guest)
    await guest.goto(url)
    await expect(guest.getByRole('heading', { level: 1 })).toContainText(`Casa de ${ownerName}`)
    await guest.getByLabel(/nombre|name/i).fill(guestName)
    await guest.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(guest).toHaveURL(/\/today$/)
    const ctx = await guest.request.get('/api/v1/household')
    const body = (await ctx.json()) as { name: string; members: { displayName: string; role: string }[] }
    expect(body.name).toBe(`Casa de ${ownerName}`)
    expect(body.members.map((m) => `${m.displayName}:${m.role}`).sort()).toEqual([`${guestName}:member`, `${ownerName}:owner`].sort())
  })
})
