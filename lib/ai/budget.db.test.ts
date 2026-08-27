import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { AiConfig } from './provider'
import { languageModel } from './provider'
import { AiStructuredError } from './structured'
import { AiBudgetError, withBudget } from './budget'

// Solo se sustituye languageModel (construye el modelo real del SDK): withBudget
// no necesita un modelo de verdad, solo pasarlo tal cual a `fn`.
vi.mock('./provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./provider')>()
  return { ...actual, languageModel: vi.fn() }
})

const FAKE_MODEL = { specificationVersion: 'v3' } as unknown as LanguageModel

let db: TestDb

async function createHousehold(patch: Partial<typeof schema.households.$inferInsert> = {}): Promise<string> {
  const [h] = await db.insert(schema.households).values({ name: 'Casa', ...patch }).returning()
  if (!h) throw new Error('no se pudo crear el hogar de prueba')
  return h.id
}

const openaiCfg: AiConfig = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test', baseUrl: null, structuredOutput: true }
const localCfg: AiConfig = { provider: 'openai_compatible', model: 'qwen3-8b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: true }

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  vi.mocked(languageModel).mockReturnValue(FAKE_MODEL)
})
afterEach(() => { vi.mocked(languageModel).mockReset() })

describe('withBudget', () => {
  it('con gasto del mes >= tope, lanza AiBudgetError y no llama a fn', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 100 })
    await db.insert(schema.aiUsageLog).values({ householdId, provider: 'openai', model: 'gpt-4o-mini', operation: 'test', tokensIn: 1, tokensOut: 1, costCents: 120 })
    const fn = vi.fn()
    await expect(withBudget(db, householdId, openaiCfg, 'parse_ingredients', fn)).rejects.toBeInstanceOf(AiBudgetError)
    expect(fn).not.toHaveBeenCalled()
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(rows).toHaveLength(1) // el gasto previo, ninguna fila nueva
  })

  it('con tope 0 (sin límite), llama a fn y registra el uso con el coste del catálogo', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 0 })
    const fn = vi.fn().mockResolvedValue({ result: 'ok', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } })
    const result = await withBudget(db, householdId, openaiCfg, 'parse_ingredients', fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledWith(FAKE_MODEL)
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', operation: 'parse_ingredients', tokensIn: 1_000_000, tokensOut: 1_000_000, costCents: 75 })
  })

  it('el proveedor local siempre cuesta 0, aunque el gasto acumulado sea alto', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 0 })
    const fn = vi.fn().mockResolvedValue({ result: 'ok', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } })
    await withBudget(db, householdId, localCfg, 'test', fn)
    const [row] = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(row?.costCents).toBe(0)
  })

  it('un modelo sin catálogo usa los precios del hogar (ai_price_*)', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 0, aiPriceInCentsPerMtok: 100, aiPriceOutCentsPerMtok: 200 })
    const cloudCfg: AiConfig = { provider: 'anthropic', model: 'modelo-personalizado', apiKey: 'sk-test', baseUrl: null, structuredOutput: true }
    const fn = vi.fn().mockResolvedValue({ result: 'ok', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } })
    await withBudget(db, householdId, cloudCfg, 'test', fn)
    const [row] = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(row?.costCents).toBe(300) // 100 + 200 céntimos
  })

  // I5 de la revisión final: antes, un fn que lanza no registraba nada y el tope
  // de gasto quedaba inerte para cualquier modelo/proveedor que siempre fallara.
  it('si fn lanza sin usage conocido, registra una fila a 0 tokens con operation:error y propaga el error', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 0 })
    const fn = vi.fn().mockRejectedValue(new Error('fallo de red'))
    await expect(withBudget(db, householdId, openaiCfg, 'test', fn)).rejects.toThrow('fallo de red')
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ operation: 'test:error', tokensIn: 0, tokensOut: 0, costCents: 0 })
  })

  it('si fn lanza un AiStructuredError con usage (NoObjectGeneratedError del SDK), registra el coste real', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 0 })
    const fn = vi.fn().mockRejectedValue(new AiStructuredError('salida inválida', { inputTokens: 1_000_000, outputTokens: 1_000_000 }))
    await expect(withBudget(db, householdId, openaiCfg, 'parse_ingredients', fn)).rejects.toBeInstanceOf(AiStructuredError)
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ operation: 'parse_ingredients:error', tokensIn: 1_000_000, tokensOut: 1_000_000, costCents: 75 })
  })

  it('un fallo del proveedor local sigue costando 0, aunque registre el usage del error', async () => {
    const householdId = await createHousehold({ aiMonthlyCapCents: 0 })
    const fn = vi.fn().mockRejectedValue(new AiStructuredError('salida inválida', { inputTokens: 1_000_000, outputTokens: 1_000_000 }))
    await expect(withBudget(db, householdId, localCfg, 'test', fn)).rejects.toBeInstanceOf(AiStructuredError)
    const [row] = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, householdId))
    expect(row).toMatchObject({ operation: 'test:error', tokensIn: 1_000_000, tokensOut: 1_000_000, costCents: 0 })
  })
})
