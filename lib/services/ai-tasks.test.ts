import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { VerifiedCredential } from '@/lib/auth/webauthn'
import { updateAiSettings } from './ai-settings'
import { aiEstimateFood, aiImportRecipe, aiParseIngredients, aiProposeWeek } from './ai-tasks'
import type { Ctx } from './ctx'
import { createUserWithHousehold } from './households'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string): Ctx => ({ db, householdId, userId, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] })

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
})

async function makeHousehold(displayName = 'Ana'): Promise<{ ctx: Ctx; householdId: string; userId: string }> {
  const { userId, householdId } = await createUserWithHousehold(db, { displayName, credential: cred(`${displayName}-${Math.random()}`), locale: 'es' })
  return { ctx: ctxOf(householdId, userId), householdId, userId }
}

async function configureOpenAi(ctx: Ctx): Promise<void> {
  await updateAiSettings(ctx, { provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, apiKey: 'sk-test', monthlyCapCents: 0, structuredOutput: true })
}

function modelReturning(json: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: json }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 20, noCache: 20, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

async function insertRecipe(householdId: string, title: string): Promise<string> {
  const [row] = await db.insert(schema.recipes).values({ householdId, title, servingsBase: 2 }).returning({ id: schema.recipes.id })
  if (!row) throw new Error('no se pudo crear la receta de prueba')
  return row.id
}

describe('ai-tasks: sin proveedor de IA configurado', () => {
  it('aiParseIngredients devuelve no_provider sin llamar a ningún modelo', async () => {
    const { ctx } = await makeHousehold()
    const result = await aiParseIngredients(ctx, ['2 huevos'])
    expect(result).toEqual({ ok: false, code: 'no_provider', message: expect.any(String) })
  })

  it('aiImportRecipe devuelve no_provider', async () => {
    const { ctx } = await makeHousehold()
    const result = await aiImportRecipe(ctx, { kind: 'text', text: 'una receta cualquiera de prueba' })
    expect(result).toMatchObject({ ok: false, code: 'no_provider' })
  })

  it('aiEstimateFood devuelve no_provider y no crea ningún alimento', async () => {
    const { ctx, householdId } = await makeHousehold()
    const result = await aiEstimateFood(ctx, 'manzana')
    expect(result).toMatchObject({ ok: false, code: 'no_provider' })
    const foods = await db.select().from(schema.foods).where(eq(schema.foods.householdId, householdId))
    expect(foods).toHaveLength(0)
  })

  it('aiProposeWeek devuelve no_provider y no crea ninguna propuesta', async () => {
    const { ctx, householdId } = await makeHousehold()
    const result = await aiProposeWeek(ctx, { from: '2026-08-24', to: '2026-08-30' })
    expect(result).toMatchObject({ ok: false, code: 'no_provider' })
    const proposals = await db.select().from(schema.planProposals).where(eq(schema.planProposals.householdId, householdId))
    expect(proposals).toHaveLength(0)
  })
})

describe('aiEstimateFood', () => {
  it('crea el alimento del hogar con source "ai" e is_estimated true', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    const model = modelReturning('{"kcal100g":52,"protein100g":0.3,"carbs100g":14,"fat100g":0.2,"fiber100g":2.4,"defaultUnit":"g","gramsPerUnit":null}')

    const result = await aiEstimateFood(ctx, 'manzana', { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('esperaba ok')
    expect(result.data).toMatchObject({ nameEs: 'manzana', nameEn: 'manzana', source: 'ai', isEstimated: true, kcal100g: 52, householdId })

    const rows = await db.select().from(schema.foods).where(eq(schema.foods.householdId, householdId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'ai', isEstimated: true, kcal100g: 52 })
  })
})

describe('aiProposeWeek', () => {
  it('crea una propuesta pendiente con un payload válido y registra el uso', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    const recipeId = await insertRecipe(householdId, 'Tortilla de patatas')
    const model = modelReturning(JSON.stringify({ picks: [{ date: '2026-08-25', slot: 'dinner', recipeId }] }))

    const result = await aiProposeWeek(ctx, { from: '2026-08-24', to: '2026-08-30' }, { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('esperaba ok')

    const [proposal] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.id, result.data.proposalId))
    expect(proposal).toBeDefined()
    expect(proposal?.status).toBe('pending')
    expect(proposal?.source).toBe('ai')
    expect(proposal?.createdByUserId).toBe(ctx.userId)
    expect(proposal?.payload).toEqual({ add: [{ date: '2026-08-25', slot: 'dinner', recipeId, servings: 2 }], remove: [] })

    const usage = await db.select().from(schema.aiUsageLog).where(and(eq(schema.aiUsageLog.householdId, householdId), eq(schema.aiUsageLog.operation, 'propose_week')))
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({ tokensIn: 20, tokensOut: 10 })
  })

  it('descarta los recipeId que el modelo inventa y no aparecen en el contexto', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    const recipeId = await insertRecipe(householdId, 'Lentejas estofadas')
    const model = modelReturning(
      JSON.stringify({
        picks: [
          { date: '2026-08-25', slot: 'lunch', recipeId },
          { date: '2026-08-26', slot: 'dinner', recipeId: '00000000-0000-0000-0000-000000000000' },
        ],
      }),
    )

    const result = await aiProposeWeek(ctx, { from: '2026-08-24', to: '2026-08-30' }, { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('esperaba ok')
    const [proposal] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.id, result.data.proposalId))
    expect(proposal?.payload).toEqual({ add: [{ date: '2026-08-25', slot: 'lunch', recipeId, servings: 2 }], remove: [] })
  })

  it('si tras filtrar no queda ningún recipeId válido, devuelve ai_output y no crea nada', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    await insertRecipe(householdId, 'Receta con id que el modelo no usará')
    const model = modelReturning(JSON.stringify({ picks: [{ date: '2026-08-25', slot: 'lunch', recipeId: '00000000-0000-0000-0000-000000000000' }] }))

    const result = await aiProposeWeek(ctx, { from: '2026-08-24', to: '2026-08-30' }, { model: model as unknown as LanguageModel })
    expect(result).toMatchObject({ ok: false, code: 'ai_output' })

    const proposals = await db.select().from(schema.planProposals).where(eq(schema.planProposals.householdId, householdId))
    expect(proposals).toHaveLength(0)
    const usage = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(usage).toHaveLength(0)
  })

  it('un hogar sin recetas propias no ve las de otro hogar (aislamiento) y devuelve ai_output', async () => {
    const a = await makeHousehold('Ana')
    await configureOpenAi(a.ctx)
    await insertRecipe(a.householdId, 'Receta de Ana')

    const b = await makeHousehold('Bea')
    await configureOpenAi(b.ctx)
    const model = modelReturning(JSON.stringify({ picks: [] }))

    const result = await aiProposeWeek(b.ctx, { from: '2026-08-24', to: '2026-08-30' }, { model: model as unknown as LanguageModel })
    expect(result).toMatchObject({ ok: false, code: 'ai_output' })
    const proposals = await db.select().from(schema.planProposals).where(eq(schema.planProposals.householdId, b.householdId))
    expect(proposals).toHaveLength(0)
  })
})
