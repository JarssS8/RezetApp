// Resuelve la configuración de IA de un hogar y construye el LanguageModel del
// AI SDK correspondiente. Regla 3 de AGENTS.md: sin proveedor configurado (o
// mal configurado) esto siempre devuelve null, nunca lanza.
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { Household } from '@/db/schema'
import { decryptSecret, getKeys } from '@/lib/crypto'
import { normalizeAiBaseUrl } from '@/lib/validation/household'
import { DEFAULT_MODEL, type AiProviderId } from './models'

export interface AiConfig {
  provider: AiProviderId
  model: string
  apiKey: string | null
  baseUrl: string | null
  structuredOutput: boolean
}

type HouseholdAiFields = Pick<Household, 'id' | 'aiProvider' | 'aiModel' | 'aiBaseUrl' | 'aiApiKeyEnc' | 'aiStructuredOutput'>

function resolveApiKey(h: Pick<HouseholdAiFields, 'id' | 'aiProvider' | 'aiApiKeyEnc'>): string | null {
  if (h.aiApiKeyEnc) {
    try {
      return decryptSecret(h.aiApiKeyEnc, getKeys().secrets)
    } catch {
      // Nunca se registra el secreto: solo que el hogar tiene una clave que ya no se puede leer
      // (p. ej. cambió APP_SECRET).
      console.error('ai: no se pudo descifrar la clave del hogar', h.id)
      return null
    }
  }
  if (h.aiProvider === 'anthropic') return process.env.AI_ANTHROPIC_API_KEY ?? null
  if (h.aiProvider === 'openai') return process.env.AI_OPENAI_API_KEY ?? null
  return null // openai_compatible: el servidor local puede no exigir clave
}

// Defensa en profundidad: la URL ya se valida y normaliza en AiSettingsSchema
// al guardarla, pero se revalida aquí por si llegó de otra vía (semilla,
// migración manual, variable de entorno) para no acabar pidiendo a un host
// público por http ni siguiendo un esquema no soportado (SSRF).
function safeBaseUrl(raw: string | null): string | null {
  return raw ? normalizeAiBaseUrl(raw) : null
}

export function resolveAiConfig(h: HouseholdAiFields): AiConfig | null {
  if (h.aiProvider === 'none') return null
  const apiKey = resolveApiKey(h)
  const structuredOutput = h.aiStructuredOutput

  if (h.aiProvider === 'openai_compatible') {
    const baseUrl = safeBaseUrl(h.aiBaseUrl) ?? safeBaseUrl(process.env.AI_LOCAL_BASE_URL ?? null)
    const model = h.aiModel ?? process.env.AI_LOCAL_MODEL ?? null
    if (!baseUrl || !model) return null
    return { provider: 'openai_compatible', model, apiKey, baseUrl, structuredOutput }
  }

  // anthropic / openai: exigen clave; anthropic además exige modelo explícito
  // porque no hay ninguno por defecto en el catálogo (ver lib/ai/models.ts).
  if (!apiKey) return null
  const model = h.aiModel ?? DEFAULT_MODEL[h.aiProvider]
  if (!model) return null
  return { provider: h.aiProvider, model, apiKey, baseUrl: null, structuredOutput }
}

export function languageModel(cfg: AiConfig): LanguageModel {
  if (cfg.provider === 'anthropic') {
    const settings = cfg.apiKey ? { apiKey: cfg.apiKey } : {}
    return createAnthropic(settings)(cfg.model)
  }
  if (cfg.provider === 'openai') {
    const settings = cfg.apiKey ? { apiKey: cfg.apiKey } : {}
    return createOpenAI(settings)(cfg.model)
  }
  if (!cfg.baseUrl) throw new Error('openai_compatible requiere baseUrl')
  return createOpenAICompatible({ name: 'local', baseURL: cfg.baseUrl, apiKey: cfg.apiKey ?? 'none' })(cfg.model)
}

// Atajo usado fuera de lib/ai (p. ej. servicios) cuando solo hace falta el modelo.
export function getProvider(h: HouseholdAiFields): LanguageModel | null {
  const cfg = resolveAiConfig(h)
  return cfg ? languageModel(cfg) : null
}
