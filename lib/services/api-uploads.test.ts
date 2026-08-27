import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { POST as postUploads } from '@/app/api/v1/uploads/route'
import { createMakeToken, req, type ApiTestState } from './api-test-helpers'

// Ver lib/services/api-recipes.test.ts: mismos motivos para los dos mocks.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

const state: ApiTestState = { db: undefined as unknown as TestDb, householdId: '', userId: '' }
const makeToken = createMakeToken(state)

// Mismo patrón que lib/uploads/store.test.ts: un directorio temporal propio
// para no escribir en ./data/uploads del repo.
let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rz-up-api-'))
  process.env.UPLOADS_DIR = dir
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

beforeAll(async () => {
  state.db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(state.db)
  const [h] = await state.db.insert(schema.households).values({ name: 'Casa' }).returning()
  const [u] = await state.db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  state.householdId = h!.id
  state.userId = u!.id
  await state.db.insert(schema.householdMembers).values({ householdId: state.householdId, userId: state.userId, role: 'owner' })
})

async function pngFormData(): Promise<FormData> {
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#2F9E6B' } }).png().toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(png)], 'foto.png', { type: 'image/png' }))
  return form
}

describe('POST /api/v1/uploads', () => {
  it('con recipes:write guarda la imagen convertida a webp bajo el hogar', async () => {
    const rw = await makeToken(['recipes:write'])
    const res = await postUploads(req('/api/v1/uploads', rw, { method: 'POST', body: await pngFormData() }))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { url: string }
    expect(body.url).toMatch(new RegExp(`^/api/uploads/${state.householdId}/[0-9a-f-]{36}\\.webp$`))
  })

  it('sin fichero: 400', async () => {
    const rw = await makeToken(['recipes:write'])
    const res = await postUploads(req('/api/v1/uploads', rw, { method: 'POST', body: new FormData() }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'validation' } })
  })

  it('sin token: 401', async () => {
    const res = await postUploads(req('/api/v1/uploads', undefined, { method: 'POST', body: await pngFormData() }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } })
  })

  it('con un token sin recipes:write: 403', async () => {
    const ro = await makeToken(['recipes:read'])
    const res = await postUploads(req('/api/v1/uploads', ro, { method: 'POST', body: await pngFormData() }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } })
  })
})
