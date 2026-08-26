import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { decryptSecret, getKeys } from '@/lib/crypto'
import { languageModel } from '@/lib/ai/provider'
import { createUserWithHousehold } from './households'
import type { Ctx } from './ctx'
import { getAiSettings, testAiConnection, updateAiSettings } from './ai-settings'
import type { VerifiedCredential } from '@/lib/auth/webauthn'

// Solo se sustituye languageModel (construye el modelo real del SDK, harían
// falta credenciales de verdad); resolveAiConfig se queda tal cual para
// probar la orquestación completa del servicio.
vi.mock('@/lib/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/provider')>()
  return { ...actual, languageModel: vi.fn() }
})

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es', scopes: [] })

const baseInput = { provider: 'openai' as const, model: 'gpt-4o-mini', baseUrl: null, monthlyCapCents: 0, structuredOutput: true }

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  vi.mocked(languageModel).mockReset()
})

describe('ai-settings', () => {
  it('cifra la clave y no guarda el texto plano; getAiSettings reporta hasKey', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await updateAiSettings(ctxOf(a.householdId, a.userId, 'owner'), { ...baseInput, apiKey: 'sk-secreta-123' })
    const [h] = await db.select().from(schema.households).where(eq(schema.households.id, a.householdId))
    expect(h?.aiApiKeyEnc).not.toBeNull()
    expect(h?.aiApiKeyEnc?.toString('utf8')).not.toContain('sk-secreta-123')
    expect(decryptSecret(h!.aiApiKeyEnc!, getKeys().secrets)).toBe('sk-secreta-123')
    const settings = await getAiSettings(ctxOf(a.householdId, a.userId, 'owner'))
    expect(settings.hasKey).toBe(true)
    expect(settings.provider).toBe('openai')
    expect(settings.model).toBe('gpt-4o-mini')
  })

  it("apiKey '' mantiene la clave guardada", async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const ctx = ctxOf(a.householdId, a.userId, 'owner')
    await updateAiSettings(ctx, { ...baseInput, apiKey: 'sk-secreta-123' })
    await updateAiSettings(ctx, { ...baseInput, apiKey: '', monthlyCapCents: 500 })
    const [h] = await db.select().from(schema.households).where(eq(schema.households.id, a.householdId))
    expect(decryptSecret(h!.aiApiKeyEnc!, getKeys().secrets)).toBe('sk-secreta-123')
    expect(h?.aiMonthlyCapCents).toBe(500)
  })

  it('apiKey null borra la clave guardada', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const ctx = ctxOf(a.householdId, a.userId, 'owner')
    await updateAiSettings(ctx, { ...baseInput, apiKey: 'sk-secreta-123' })
    await updateAiSettings(ctx, { ...baseInput, apiKey: null })
    const settings = await getAiSettings(ctx)
    expect(settings.hasKey).toBe(false)
  })

  it('un member no puede cambiar los ajustes de IA', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await expect(updateAiSettings(ctxOf(a.householdId, a.userId, 'member'), baseInput)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('spentThisMonthCents suma solo el gasto del mes en curso', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await db.insert(schema.aiUsageLog).values({ householdId: a.householdId, provider: 'openai', model: 'gpt-4o-mini', operation: 'test', tokensIn: 100, tokensOut: 50, costCents: 10, createdAt: now })
    await db.insert(schema.aiUsageLog).values({ householdId: a.householdId, provider: 'openai', model: 'gpt-4o-mini', operation: 'test', tokensIn: 100, tokensOut: 50, costCents: 999, createdAt: lastMonth })
    const settings = await getAiSettings(ctxOf(a.householdId, a.userId, 'owner'))
    expect(settings.spentThisMonthCents).toBe(10)
  })
})

describe('testAiConnection', () => {
  it('sin proveedor configurado no llama al modelo y devuelve not_configured', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const result = await testAiConnection(ctxOf(a.householdId, a.userId, 'owner'))
    expect(result).toMatchObject({ ok: false, error: 'not_configured', latencyMs: 0 })
    expect(languageModel).not.toHaveBeenCalled()
  })

  it('conexión correcta: ok true y registra ai_usage_log con operation test', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const ctx = ctxOf(a.householdId, a.userId, 'owner')
    await updateAiSettings(ctx, { ...baseInput, apiKey: 'sk-test' })
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'OK' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 3, text: 3, reasoning: undefined },
        },
        warnings: [],
      }),
    })
    vi.mocked(languageModel).mockReturnValue(model as unknown as LanguageModel)
    const result = await testAiConnection(ctx)
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, a.householdId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.operation).toBe('test')
  })

  it('el modelo lanza: ok false y error provider, sin registrar uso', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const ctx = ctxOf(a.householdId, a.userId, 'owner')
    await updateAiSettings(ctx, { ...baseInput, apiKey: 'sk-test' })
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error('fallo de red')
      },
    })
    vi.mocked(languageModel).mockReturnValue(model as unknown as LanguageModel)
    const result = await testAiConnection(ctx)
    expect(result).toMatchObject({ ok: false, error: 'provider' })
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, a.householdId))
    expect(rows).toHaveLength(0)
  })

  it('un member no puede probar la conexión de IA: no llama al proveedor ni gasta presupuesto', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await updateAiSettings(ctxOf(a.householdId, a.userId, 'owner'), { ...baseInput, apiKey: 'sk-test' })
    await expect(testAiConnection(ctxOf(a.householdId, a.userId, 'member'))).rejects.toMatchObject({ code: 'forbidden' })
    expect(languageModel).not.toHaveBeenCalled()
    const rows = await db.select().from(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, a.householdId))
    expect(rows).toHaveLength(0)
  })
})
