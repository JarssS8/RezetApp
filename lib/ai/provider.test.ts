import { afterEach, describe, expect, it } from 'vitest'
import { encryptSecret, getKeys } from '@/lib/crypto'
import { estimateCostCents, modelInfo } from './models'
import { resolveAiConfig } from './provider'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

const base = { aiProvider: 'none' as const, aiModel: null, aiBaseUrl: null, aiApiKeyEnc: null, aiStructuredOutput: true }

describe('resolveAiConfig', () => {
  afterEach(() => {
    delete process.env.AI_ANTHROPIC_API_KEY
    delete process.env.AI_OPENAI_API_KEY
    delete process.env.AI_LOCAL_BASE_URL
    delete process.env.AI_LOCAL_MODEL
  })

  it("aiProvider 'none' devuelve null", () => {
    expect(resolveAiConfig(base)).toBeNull()
  })

  it('con clave cifrada, la descifra', () => {
    const enc = encryptSecret('sk-secreta', getKeys().secrets)
    const cfg = resolveAiConfig({ ...base, aiProvider: 'openai', aiApiKeyEnc: enc, aiModel: 'gpt-4o-mini' })
    expect(cfg).toEqual({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-secreta', baseUrl: null, structuredOutput: true })
  })

  it('sin clave en el hogar, usa la de entorno', () => {
    process.env.AI_OPENAI_API_KEY = 'env-key'
    const cfg = resolveAiConfig({ ...base, aiProvider: 'openai' })
    expect(cfg?.apiKey).toBe('env-key')
    expect(cfg?.model).toBe('gpt-4o-mini') // sin aiModel, usa el modelo por defecto del catálogo
  })

  it('anthropic sin modelo explícito queda sin configurar (no hay id por defecto)', () => {
    process.env.AI_ANTHROPIC_API_KEY = 'env-key'
    expect(resolveAiConfig({ ...base, aiProvider: 'anthropic' })).toBeNull()
  })

  it('openai_compatible sin baseUrl ni variable de entorno devuelve null', () => {
    expect(resolveAiConfig({ ...base, aiProvider: 'openai_compatible', aiModel: 'qwen3-8b' })).toBeNull()
  })

  it('openai_compatible con baseUrl de entorno funciona sin clave', () => {
    process.env.AI_LOCAL_BASE_URL = 'http://localhost:8080/v1'
    process.env.AI_LOCAL_MODEL = 'qwen3-8b'
    const cfg = resolveAiConfig({ ...base, aiProvider: 'openai_compatible' })
    expect(cfg).toEqual({ provider: 'openai_compatible', model: 'qwen3-8b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: true })
  })
})

describe('estimateCostCents', () => {
  it('calcula el coste con un modelo conocido', () => {
    const info = modelInfo('openai', 'gpt-4o-mini')
    expect(estimateCostCents(info, 1_000_000, 1_000_000)).toBe(75) // 15 + 60 céntimos
  })

  it('un modelo desconocido cuesta 0', () => {
    expect(estimateCostCents(null, 1_000_000, 1_000_000)).toBe(0)
    expect(modelInfo('openai', 'no-existe')).toBeNull()
  })
})
