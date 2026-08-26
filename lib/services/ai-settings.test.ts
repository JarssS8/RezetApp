import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { decryptSecret, getKeys } from '@/lib/crypto'
import { createUserWithHousehold } from './households'
import type { Ctx } from './ctx'
import { getAiSettings, updateAiSettings } from './ai-settings'
import type { VerifiedCredential } from '@/lib/auth/webauthn'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es', scopes: [] })

const baseInput = { provider: 'openai' as const, model: 'gpt-4o-mini', baseUrl: null, monthlyCapCents: 0, structuredOutput: true }

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

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
    await expect(updateAiSettings(ctxOf(a.householdId, a.userId, 'member'), baseInput)).rejects.toThrow()
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
