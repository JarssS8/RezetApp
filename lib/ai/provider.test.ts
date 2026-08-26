import { afterEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret, getKeys } from '@/lib/crypto'
import { estimateCostCents, modelInfo } from './models'
import { languageModel, resolveAiConfig } from './provider'

const { createOpenAICompatibleMock } = vi.hoisted(() => ({ createOpenAICompatibleMock: vi.fn(() => () => ({})) }))
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: createOpenAICompatibleMock }))

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

const base = { id: 'h1', aiProvider: 'none' as const, aiModel: null, aiBaseUrl: null, aiApiKeyEnc: null, aiStructuredOutput: true }

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

  it('openai_compatible con una baseUrl pública por http se rechaza (defensa SSRF)', () => {
    const cfg = resolveAiConfig({ ...base, aiProvider: 'openai_compatible', aiBaseUrl: 'http://example.com/v1', aiModel: 'qwen3-8b' })
    expect(cfg).toBeNull()
  })

  it('una clave que no se puede descifrar se registra sin el secreto y cae a null', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const corrupted = Buffer.from('esto-no-es-un-blob-cifrado-valido-de-verdad')
    const cfg = resolveAiConfig({ ...base, id: 'hogar-123', aiProvider: 'openai', aiApiKeyEnc: corrupted, aiModel: 'gpt-4o-mini' })
    expect(cfg).toBeNull() // sin clave (ni de hogar ni de entorno) y openai la exige
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no se pudo descifrar'), 'hogar-123')
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('esto-no-es-un-blob-cifrado-valido-de-verdad')
    spy.mockRestore()
  })
})

describe('languageModel', () => {
  afterEach(() => {
    createOpenAICompatibleMock.mockClear()
  })

  it("con proveedor 'openai_compatible' y salida estructurada activa, pide supportsStructuredOutputs al adaptador", () => {
    languageModel({ provider: 'openai_compatible', model: 'qwen3-8b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: true })
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(expect.objectContaining({ supportsStructuredOutputs: true }))
  })

  it('con salida estructurada desactivada, no lo pide', () => {
    languageModel({ provider: 'openai_compatible', model: 'qwen3-8b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: false })
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(expect.objectContaining({ supportsStructuredOutputs: false }))
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
