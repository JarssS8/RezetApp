import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { GET as getRecipes, POST as postRecipes } from '@/app/api/v1/recipes/route'
import { DELETE as deleteRecipe, GET as getRecipe } from '@/app/api/v1/recipes/[id]/route'
import { POST as postImport } from '@/app/api/v1/recipes/import/route'
import { GET as getExport } from '@/app/api/v1/export/route'
import { createMakeToken, req, type ApiTestState } from './api-test-helpers'

// Fuera de webpack, "server-only" resuelve siempre a su índice, que lanza a
// propósito (marca de RSC, no comprobación real): sin esto, cualquier test que
// importe una ruta -que arrastra lib/auth/guards.ts- rompería en el import.
vi.mock('server-only', () => ({}))
// cookies() de Next exige un contexto de petición real (AsyncLocalStorage) que
// no existe al llamar a la ruta directamente en un test: sin él lanza en vez
// de devolver una jarra vacía. Se sustituye por una sin cookies, que es
// justo lo que produciría una petición real sin cabecera Cookie.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

// La ruta usa el singleton @/db (no ctx.db de getTestDb()) para lo que no pasa
// por cabecera authorization: fijamos DATABASE_URL antes del primer acceso,
// igual que en db/index.test.ts y lib/mcp/server.db.test.ts.
beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

const state: ApiTestState = { db: undefined as unknown as TestDb, householdId: '', userId: '' }
const makeToken = createMakeToken(state)

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

describe('/api/v1/recipes', () => {
  it('POST crea, GET lista, GET /{id}?servings= escala y DELETE borra (soft)', async () => {
    const rw = await makeToken(['recipes:read', 'recipes:write'])
    const created = await postRecipes(
      req('/api/v1/recipes', rw, {
        method: 'POST',
        body: JSON.stringify({ title: 'Sopa', servingsBase: 2, ingredients: [{ rawText: '300 g de cebolla' }], steps: [{ text: 'Pocha' }] }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const list = await getRecipes(req('/api/v1/recipes?q=Sopa', rw))
    expect(list.status).toBe(200)
    expect((await list.json()).total).toBe(1)

    const one = await getRecipe(req(`/api/v1/recipes/${id}?servings=4`, rw), { params: Promise.resolve({ id }) })
    const body = (await one.json()) as { scaled: { servings: number } | null }
    expect(body.scaled?.servings).toBe(4)

    expect((await deleteRecipe(req(`/api/v1/recipes/${id}`, rw, { method: 'DELETE' }), { params: Promise.resolve({ id }) })).status).toBe(204)
    expect((await getRecipe(req(`/api/v1/recipes/${id}`, rw), { params: Promise.resolve({ id }) })).status).toBe(404)
  })

  it('un token de solo lectura no puede escribir', async () => {
    const ro = await makeToken(['recipes:read'])
    const res = await postRecipes(req('/api/v1/recipes', ro, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(403)
  })

  it('cuerpo inválido: 400 validation, no 500', async () => {
    const rw = await makeToken(['recipes:write'])
    expect((await postRecipes(req('/api/v1/recipes', rw, { method: 'POST', body: 'no soy json', headers: { 'content-type': 'application/json' } }))).status).toBe(400)
  })

  it('POST /recipes/import devuelve un borrador desde texto', async () => {
    const rw = await makeToken(['recipes:write'])
    const res = await postImport(
      req('/api/v1/recipes/import', rw, {
        method: 'POST',
        body: JSON.stringify({ kind: 'text', text: 'Sopa de cebolla\n\n300 g de cebolla\n\nPocha la cebolla 20 minutos' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).title).toContain('Sopa')
  })

  it('GET /export vuelca las recetas del hogar', async () => {
    const ro = await makeToken(['recipes:read'])
    const res = await getExport(req('/api/v1/export', ro))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ version: 1 })
  })
})
