// Tope de gasto mensual de IA del hogar. Antes de cada llamada comprueba que
// el gasto acumulado del mes en curso no alcanza el tope (si el tope es 0, no
// hay límite); tras una llamada correcta registra el uso en `ai_usage_log`.
// El coste sale del catálogo de lib/ai/models.ts o, si el catálogo no tiene
// el modelo (p. ej. anthropic, que no trae ids ni precios de serie), de los
// precios que declaró el propio hogar; el proveedor local (openai_compatible)
// siempre cuesta 0 (regla W2-R3 / spec §10).
import { and, eq, sql } from 'drizzle-orm'
import type { LanguageModel } from 'ai'
import * as schema from '@/db/schema'
import type { Db } from '@/db/types'
import { modelInfo } from './models'
import { languageModel } from './provider'
import type { AiConfig } from './provider'

export class AiBudgetError extends Error {
  readonly code = 'ai_budget'
  constructor(message = 'Se ha alcanzado el tope de gasto mensual de IA') {
    super(message)
    this.name = 'AiBudgetError'
  }
}

interface Usage {
  inputTokens: number
  outputTokens: number
}

// Precio en céntimos por millón de tokens (in/out) para cfg: catálogo si lo
// tiene, si no los `ai_price_*` del hogar (0 si tampoco los tiene); el
// proveedor local siempre es 0, tenga o no el modelo en el catálogo.
function resolvePrices(cfg: AiConfig, priceInOverride: number | null, priceOutOverride: number | null): { priceIn: number; priceOut: number } {
  if (cfg.provider === 'openai_compatible') return { priceIn: 0, priceOut: 0 }
  const info = modelInfo(cfg.provider, cfg.model)
  if (info) return { priceIn: info.inputCentsPerM, priceOut: info.outputCentsPerM }
  return { priceIn: priceInOverride ?? 0, priceOut: priceOutOverride ?? 0 }
}

export async function withBudget<T>(
  db: Db,
  householdId: string,
  cfg: AiConfig,
  operation: string,
  fn: (model: LanguageModel) => Promise<{ result: T; usage: Usage }>,
): Promise<T> {
  const [household] = await db
    .select({
      capCents: schema.households.aiMonthlyCapCents,
      priceInOverride: schema.households.aiPriceInCentsPerMtok,
      priceOutOverride: schema.households.aiPriceOutCentsPerMtok,
    })
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
    .limit(1)
  const capCents = household?.capCents ?? 0

  if (capCents > 0) {
    const [spent] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.aiUsageLog.costCents}), 0)::int` })
      .from(schema.aiUsageLog)
      .where(and(eq(schema.aiUsageLog.householdId, householdId), sql`${schema.aiUsageLog.createdAt} >= date_trunc('month', now())`))
    if ((spent?.total ?? 0) >= capCents) throw new AiBudgetError()
  }

  const model = languageModel(cfg)
  const { result, usage } = await fn(model)

  const { priceIn, priceOut } = resolvePrices(cfg, household?.priceInOverride ?? null, household?.priceOutOverride ?? null)
  const costCents = Math.round((usage.inputTokens * priceIn + usage.outputTokens * priceOut) / 1_000_000)

  await db.insert(schema.aiUsageLog).values({
    householdId,
    provider: cfg.provider,
    model: cfg.model,
    operation,
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    costCents,
  })

  return result
}
