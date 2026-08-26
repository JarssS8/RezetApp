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
import { listProposals } from './plan'

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

// Tope bajo (100 céntimos) ya rebasado por un gasto previo, para forzar AiBudgetError.
async function configureOpenAiWithExhaustedBudget(ctx: Ctx, householdId: string): Promise<void> {
  await updateAiSettings(ctx, { provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, apiKey: 'sk-test', monthlyCapCents: 100, structuredOutput: true })
  await db.insert(schema.aiUsageLog).values({ householdId, provider: 'openai', model: 'gpt-4o-mini', operation: 'test', tokensIn: 1, tokensOut: 1, costCents: 150 })
}

// Servidor local con un modelo sin visión conocida (lib/ai/models.ts::supportsVision):
// sirve para forzar AiUnsupportedError en aiImportRecipe con kind 'image'.
async function configureLocalTextOnly(ctx: Ctx): Promise<void> {
  await updateAiSettings(ctx, { provider: 'openai_compatible', model: 'qwen3-8b', baseUrl: 'http://localhost:8080/v1', apiKey: null, monthlyCapCents: 0, structuredOutput: true })
}

// El precio de gpt-4o-mini en lib/ai/models.ts (15/60 céntimos por millón de
// tokens in/out): con 1_000_000 tokens de cada, el coste esperado es
// 1_000_000*15/1e6 + 1_000_000*60/1e6 = 75 céntimos (igual que en budget.db.test.ts).
const CATALOG_INPUT_TOKENS = 1_000_000
const CATALOG_OUTPUT_TOKENS = 1_000_000
const CATALOG_EXPECTED_COST_CENTS = 75

function modelReturningWithUsage(json: string, inputTokens: number, outputTokens: number): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: json }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

function modelReturning(json: string): MockLanguageModelV3 {
  return modelReturningWithUsage(json, 20, 10)
}

async function usageRowsFor(householdId: string, operation: string): Promise<(typeof schema.aiUsageLog.$inferSelect)[]> {
  return db.select().from(schema.aiUsageLog).where(and(eq(schema.aiUsageLog.householdId, householdId), eq(schema.aiUsageLog.operation, operation)))
}

async function insertRecipe(householdId: string, title: string, patch: Partial<typeof schema.recipes.$inferInsert> = {}): Promise<string> {
  const [row] = await db.insert(schema.recipes).values({ householdId, title, servingsBase: 2, ...patch }).returning({ id: schema.recipes.id })
  if (!row) throw new Error('no se pudo crear la receta de prueba')
  return row.id
}

async function tagRecipe(householdId: string, recipeId: string, tagName: string): Promise<void> {
  const [tag] = await db.insert(schema.tags).values({ householdId, name: tagName, slug: tagName }).returning({ id: schema.tags.id })
  if (!tag) throw new Error('no se pudo crear la etiqueta de prueba')
  await db.insert(schema.recipeTags).values({ recipeId, tagId: tag.id })
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

    const pending = await listProposals(ctx, 'pending')
    const proposal = pending.find((p) => p.id === result.data.proposalId)
    expect(proposal).toBeDefined()
    expect(proposal?.status).toBe('pending')
    expect(proposal?.source).toBe('ai')
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
    const pending = await listProposals(ctx, 'pending')
    const proposal = pending.find((p) => p.id === result.data.proposalId)
    expect(proposal?.source).toBe('ai')
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

describe('registro de uso real (no se descarta el usage de generateStructured)', () => {
  it('aiParseIngredients registra tokens no nulos y el coste según el catálogo', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    const model = modelReturningWithUsage('{"lines":[{"quantity":2,"unit":"g","foodName":"arroz","preparation":null}]}', CATALOG_INPUT_TOKENS, CATALOG_OUTPUT_TOKENS)

    const result = await aiParseIngredients(ctx, ['2 g de arroz'], { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)

    const rows = await usageRowsFor(householdId, 'parse_ingredients')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tokensIn: CATALOG_INPUT_TOKENS, tokensOut: CATALOG_OUTPUT_TOKENS, costCents: CATALOG_EXPECTED_COST_CENTS })
  })

  it('aiImportRecipe registra tokens no nulos y el coste según el catálogo', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    const json =
      '{"title":"Tortilla","description":null,"servingsBase":2,"prepMinutes":5,"cookMinutes":10,"difficulty":"easy","tags":[],"ingredients":[{"rawText":"4 huevos"}],"steps":[{"text":"Bate los huevos","timerSeconds":null}]}'
    const model = modelReturningWithUsage(json, CATALOG_INPUT_TOKENS, CATALOG_OUTPUT_TOKENS)

    const result = await aiImportRecipe(ctx, { kind: 'text', text: 'una receta de tortilla' }, { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)

    const rows = await usageRowsFor(householdId, 'import_recipe')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tokensIn: CATALOG_INPUT_TOKENS, tokensOut: CATALOG_OUTPUT_TOKENS, costCents: CATALOG_EXPECTED_COST_CENTS })
  })

  it('aiEstimateFood registra tokens no nulos y el coste según el catálogo', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)
    const json = '{"kcal100g":52,"protein100g":0.3,"carbs100g":14,"fat100g":0.2,"fiber100g":2.4,"defaultUnit":"g","gramsPerUnit":null}'
    const model = modelReturningWithUsage(json, CATALOG_INPUT_TOKENS, CATALOG_OUTPUT_TOKENS)

    const result = await aiEstimateFood(ctx, 'manzana', { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)

    const rows = await usageRowsFor(householdId, 'estimate_nutrition')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tokensIn: CATALOG_INPUT_TOKENS, tokensOut: CATALOG_OUTPUT_TOKENS, costCents: CATALOG_EXPECTED_COST_CENTS })
  })
})

describe('mapeo de errores conocidos a AiResult', () => {
  it('AiBudgetError -> ai_budget, sin llamar al modelo ni registrar uso nuevo', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAiWithExhaustedBudget(ctx, householdId)
    const model = modelReturning('{"lines":[]}')

    const result = await aiParseIngredients(ctx, ['2 huevos'], { model: model as unknown as LanguageModel })
    expect(result).toMatchObject({ ok: false, code: 'ai_budget' })
    expect(model.doGenerateCalls).toHaveLength(0)

    const rows = await usageRowsFor(householdId, 'parse_ingredients')
    expect(rows).toHaveLength(0)
  })

  it('AiUnsupportedError -> ai_unsupported cuando el modelo local no admite imágenes', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureLocalTextOnly(ctx)
    const model = modelReturning('{}')
    const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }

    const result = await aiImportRecipe(ctx, { kind: 'image', bytes: image.bytes, mime: image.mime }, { model: model as unknown as LanguageModel })
    expect(result).toMatchObject({ ok: false, code: 'ai_unsupported' })
    expect(model.doGenerateCalls).toHaveLength(0)

    const rows = await usageRowsFor(householdId, 'import_recipe')
    expect(rows).toHaveLength(0)
  })
})

describe('contexto de aiProposeWeek acotado', () => {
  it('ordena las recetas por lastCookedAt (nulls first) y timesCooked asc, y acota las etiquetas a 5', async () => {
    const { ctx, householdId } = await makeHousehold()
    await configureOpenAi(ctx)

    const recentlyCooked = await insertRecipe(householdId, 'Cocinada hace poco', { timesCooked: 1, lastCookedAt: new Date('2026-08-01T00:00:00Z') })
    const neverCookedMany = await insertRecipe(householdId, 'Nunca cocinada, muchas veces en teoría', { timesCooked: 2, lastCookedAt: null })
    const neverCookedFew = await insertRecipe(householdId, 'Nunca cocinada', { timesCooked: 0, lastCookedAt: null })
    for (const tagName of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      await tagRecipe(householdId, neverCookedFew, tagName)
    }

    const model = modelReturning(JSON.stringify({ picks: [{ date: '2026-08-25', slot: 'lunch', recipeId: neverCookedFew }] }))
    const result = await aiProposeWeek(ctx, { from: '2026-08-24', to: '2026-08-30' }, { model: model as unknown as LanguageModel })
    expect(result.ok).toBe(true)

    const userMessage = model.doGenerateCalls[0]?.prompt.find((m) => m.role === 'user')
    const userContent = userMessage?.content as Array<{ type: string; text: string }> | undefined
    const text = userContent?.[0]?.text ?? ''
    const sentContext = JSON.parse(text) as { recipes: { id: string; tags: string[] }[] }

    expect(sentContext.recipes.map((r) => r.id)).toEqual([neverCookedFew, neverCookedMany, recentlyCooked])
    const withTags = sentContext.recipes.find((r) => r.id === neverCookedFew)
    expect(withTags?.tags).toHaveLength(5)
  })
})
