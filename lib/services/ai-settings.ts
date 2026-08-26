// Ajustes de IA del hogar: lectura, actualización (solo propietario) y prueba
// de conexión. Regla 3 de AGENTS.md: sin proveedor configurado, la app sigue
// funcionando; este servicio nunca asume que hay uno.
import { and, eq, gte, sql } from 'drizzle-orm'
import { generateText } from 'ai'
import type { z } from 'zod'
import * as schema from '@/db/schema'
import { encryptSecret, getKeys } from '@/lib/crypto'
import { estimateCostCents, modelInfo } from '@/lib/ai/models'
import { languageModel, resolveAiConfig } from '@/lib/ai/provider'
import type { AiSettingsSchema } from '@/lib/validation/household'
import { type Ctx, ServiceError } from './ctx'

export type AiSettings = z.infer<typeof AiSettingsSchema>

export interface AiSettingsView {
  provider: AiSettings['provider']
  model: string | null
  baseUrl: string | null
  hasKey: boolean
  monthlyCapCents: number
  structuredOutput: boolean
  spentThisMonthCents: number
}

const TEST_PROMPT = 'Responde OK'
const TEST_MAX_OUTPUT_TOKENS = 10
const TEST_TIMEOUT_MS = 15_000

function monthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

async function getHousehold(ctx: Ctx): Promise<typeof schema.households.$inferSelect> {
  const [h] = await ctx.db.select().from(schema.households).where(eq(schema.households.id, ctx.householdId)).limit(1)
  if (!h) throw new ServiceError('not_found', 'Hogar no encontrado')
  return h
}

export async function getAiSettings(ctx: Ctx): Promise<AiSettingsView> {
  const h = await getHousehold(ctx)
  const [spent] = await ctx.db
    .select({ total: sql<number>`coalesce(sum(${schema.aiUsageLog.costCents}), 0)::int` })
    .from(schema.aiUsageLog)
    .where(and(eq(schema.aiUsageLog.householdId, ctx.householdId), gte(schema.aiUsageLog.createdAt, monthStart())))
  return {
    provider: h.aiProvider,
    model: h.aiModel,
    baseUrl: h.aiBaseUrl,
    hasKey: h.aiApiKeyEnc !== null,
    monthlyCapCents: h.aiMonthlyCapCents,
    structuredOutput: h.aiStructuredOutput,
    spentThisMonthCents: spent?.total ?? 0,
  }
}

export async function updateAiSettings(ctx: Ctx, input: AiSettings): Promise<void> {
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario puede cambiar la IA')
  const patch: Partial<typeof schema.households.$inferInsert> = {
    aiProvider: input.provider,
    aiModel: input.model,
    aiBaseUrl: input.baseUrl,
    aiMonthlyCapCents: input.monthlyCapCents,
    aiStructuredOutput: input.structuredOutput,
  }
  // apiKey: undefined o '' mantiene la clave guardada; null la borra; cualquier
  // otro valor la sustituye cifrada.
  if (input.apiKey === null) {
    patch.aiApiKeyEnc = null
  } else if (input.apiKey) {
    patch.aiApiKeyEnc = encryptSecret(input.apiKey, getKeys().secrets)
  }
  await ctx.db.update(schema.households).set(patch).where(eq(schema.households.id, ctx.householdId))
}

export type AiConnectionErrorCode = 'not_configured' | 'provider' | 'timeout'

export interface AiConnectionResult {
  ok: boolean
  message: string
  latencyMs: number
  error?: AiConnectionErrorCode
}

function isTimeoutError(err: unknown): boolean {
  // AbortSignal.timeout() aborta con un DOMException 'TimeoutError'.
  return err instanceof Error && err.name === 'TimeoutError'
}

export async function testAiConnection(ctx: Ctx): Promise<AiConnectionResult> {
  const h = await getHousehold(ctx)
  const cfg = resolveAiConfig(h)
  if (!cfg) return { ok: false, message: 'Sin proveedor de IA configurado', latencyMs: 0, error: 'not_configured' }
  const start = Date.now()
  try {
    const model = languageModel(cfg)
    const result = await generateText({ model, prompt: TEST_PROMPT, maxOutputTokens: TEST_MAX_OUTPUT_TOKENS, abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS) })
    const latencyMs = Date.now() - start
    const tokensIn = result.usage.inputTokens ?? 0
    const tokensOut = result.usage.outputTokens ?? 0
    const info = modelInfo(cfg.provider, cfg.model)
    await ctx.db.insert(schema.aiUsageLog).values({
      householdId: ctx.householdId,
      provider: cfg.provider,
      model: cfg.model,
      operation: 'test',
      tokensIn,
      tokensOut,
      costCents: estimateCostCents(info, tokensIn, tokensOut),
    })
    return { ok: true, message: result.text, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - start
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { ok: false, message, latencyMs, error: isTimeoutError(err) ? 'timeout' : 'provider' }
  }
}
