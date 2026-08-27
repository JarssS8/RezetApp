import { randomUUID } from 'node:crypto'
import { expect, type CDPSession, type Page } from '@playwright/test'
import { enableVirtualAuthenticator } from './webauthn'

// Nombre único por ejecución: el servidor de e2e usa la base de datos de
// desarrollo (no se trunca entre ejecuciones), así que evitamos nombres fijos.
export function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

// Registro completo con passkey: deja la sesión abierta en /today y devuelve
// también el autenticador virtual, para los casos que necesitan inspeccionarlo
// (e2e/auth.spec.ts: login con credencial descubrible).
//
// El navegador de e2e negocia su propio idioma (Accept-Language) contra
// resolveLocale (lib/i18n/messages.ts), así que los textos se buscan en los
// dos idiomas, igual que en el resto de specs.
export async function registerHouseholdWithAuthenticator(
  page: Page,
  base = 'E2e',
): Promise<{ name: string; cdp: CDPSession; authenticatorId: string }> {
  const name = uniqueName(base)
  const { cdp, authenticatorId } = await enableVirtualAuthenticator(page)
  await page.goto('/register')
  await page.getByLabel(/nombre|name/i).fill(name)
  await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
  await expect(page).toHaveURL(/\/today$/)
  return { name, cdp, authenticatorId }
}

export async function registerHousehold(page: Page, base = 'E2e'): Promise<string> {
  return (await registerHouseholdWithAuthenticator(page, base)).name
}
