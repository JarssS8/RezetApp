import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'
import { registerHousehold, registerHouseholdWithAuthenticator, uniqueName } from './helpers/session'

test.describe('passkeys', () => {
  test('registro crea hogar y entra en Hoy', async ({ page }) => {
    await registerHousehold(page, 'Ana')
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('login con credencial descubrible', async ({ page }) => {
    const { cdp, authenticatorId } = await registerHouseholdWithAuthenticator(page, 'Bo')
    await page.request.post('/api/auth/logout')
    await page.goto('/login')
    await page.getByTestId('login-button').click()
    await expect(page).toHaveURL(/\/today$/)
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
    expect(credentials.length).toBe(1)
  })

  // Desde T11b la guardia del marco vive detrás de un <Suspense>: el armazón
  // sale antes que la sesión, así que hay que comprobar que la redirección
  // sigue llegando. /settings/data va en la lista a propósito — es la que se
  // quedó sin guardia propia cuando el layout dejó de bloquear.
  test('sin sesión, las pantallas de dentro llevan a /login', async ({ browser }) => {
    const anon = await browser.newPage()
    for (const path of ['/today', '/plan', '/recipes', '/pantry', '/cook', '/settings/data']) {
      await anon.goto(path)
      await expect(anon, `${path} no ha redirigido`).toHaveURL(/\/login$/)
      // Ancla positiva: la página de login pintada de verdad, no un armazón
      // vacío que casualmente esté en esa URL.
      await expect(anon.getByTestId('login-button')).toBeVisible()
    }
    await anon.close()
  })

  test('invitación: segunda persona entra como miembro', async ({ browser }) => {
    const owner = await browser.newPage()
    const ownerName = await registerHousehold(owner, 'Ana')
    // La invitación se crea por la API interna a propósito: el recorrido por la
    // interfaz de Ajustes → Miembros lo cubre e2e/settings.spec.ts, y aquí lo
    // que se prueba es que la segunda passkey entra en el hogar existente.
    const res = await owner.request.post('/api/v1/household/invites')
    expect(res.ok()).toBeTruthy()
    const { url } = (await res.json()) as { url: string }

    const guestName = uniqueName('Bo')
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
