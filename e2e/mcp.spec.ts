import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

// Nombre único por ejecución: mismo motivo que en auth.spec.ts y settings.spec.ts
// (base de datos compartida entre ejecuciones).
function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`
}

// El transporte MCP exige que el cliente acepte los dos formatos aunque el
// servidor (stateless) responda siempre JSON (docs/05-MCP.md).
const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }

test.describe('mcp', () => {
  test('token creado en ajustes: tools/list y una llamada real', async ({ page, request, baseURL }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill(uniqueName('Mcp'))
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)

    // Token con lectura de hogar y de recetas: alcanza para get_household_context,
    // search_recipes y get_recipe, pero no para herramientas de escritura del plan.
    await page.goto('/settings/tokens')
    await page.getByRole('button', { name: /crear token|create token/i }).click()
    const tokenDialog = page.getByRole('dialog')
    await tokenDialog.getByLabel(/^nombre$|^name$/i).fill('e2e mcp')
    await tokenDialog.getByLabel(/leer el hogar|read the household/i).check()
    await tokenDialog.getByLabel(/leer recetas|read recipes/i).check()
    await tokenDialog.getByRole('button', { name: /crear token|create token/i }).click()

    // El token en claro se enseña una sola vez, al crearlo.
    const newToken = tokenDialog.getByTestId('new-token')
    await expect(newToken).toBeVisible()
    const token = (await newToken.innerText()).trim()
    expect(token.startsWith('rz_')).toBe(true)

    const list = await request.post(`${baseURL}/mcp`, {
      headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    })
    expect(list.ok()).toBe(true)
    const names = ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)
    expect(names).toContain('get_household_context')
    expect(names).toContain('search_recipes')
    expect(names).toContain('get_recipe')
    // Sin plan:write ni pantry:write, ni set_meal_plan ni update_pantry deben aparecer.
    expect(names).not.toContain('set_meal_plan')
    expect(names).not.toContain('update_pantry')

    const call = await request.post(`${baseURL}/mcp`, {
      headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
      data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_household_context', arguments: {} } },
    })
    expect(call.ok()).toBe(true)
    expect(JSON.stringify(await call.json())).toContain('defaultServings')

    // Sin token: 401.
    const anon = await request.post(`${baseURL}/mcp`, {
      headers: MCP_HEADERS,
      data: { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      failOnStatusCode: false,
    })
    expect(anon.status()).toBe(401)

    // GET no tiene sentido en un transporte sin estado (docs/05-MCP.md): 405.
    const got = await request.get(`${baseURL}/mcp`, {
      headers: { authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    })
    expect(got.status()).toBe(405)
  })
})
