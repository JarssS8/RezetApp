import { expect, test } from '@playwright/test'

test('health responde con db', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ ok: true, db: true })
})
