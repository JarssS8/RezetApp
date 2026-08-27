import { describe, expect, it } from 'vitest'
import type { LanguageModel } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import type { AiConfig } from './provider'
import { AiStructuredError, generateStructured } from './structured'

const schema = z.object({ quantity: z.number() })
const prompt = { system: 'Devuelve un único objeto JSON con la cantidad.', user: '2 huevos' }

const openaiCfg: AiConfig = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test', baseUrl: null, structuredOutput: true }
const localCfg: AiConfig = { provider: 'openai_compatible', model: 'qwen3-8b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: true }

function modelReturning(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 4, text: 4, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

describe('generateStructured', () => {
  it('parsea la salida válida con el esquema y devuelve el uso', async () => {
    const model = modelReturning('{"quantity":2}')
    const { result, usage } = await generateStructured(openaiCfg, model as unknown as LanguageModel, schema, prompt)
    expect(result).toEqual({ quantity: 2 })
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 4 })
  })

  it('una salida que no cumple el esquema lanza AiStructuredError (código ai_invalid_output)', async () => {
    const model = modelReturning('{"quantity":"dos"}')
    await expect(generateStructured(openaiCfg, model as unknown as LanguageModel, schema, prompt)).rejects.toMatchObject({
      code: 'ai_invalid_output',
    })
  })

  it('una salida que no es JSON también lanza AiStructuredError', async () => {
    const model = modelReturning('no es json')
    const err = await generateStructured(openaiCfg, model as unknown as LanguageModel, schema, prompt).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiStructuredError)
  })

  // fix 5 de la revisión final: withBudget necesita el usage real aunque la
  // llamada falle, para no dejar el tope de gasto inerte con un modelo que
  // siempre devuelve una salida inválida.
  it('cuando la salida no cumple el esquema, AiStructuredError conserva el usage real del proveedor', async () => {
    const model = modelReturning('{"quantity":"dos"}')
    const err = await generateStructured(openaiCfg, model as unknown as LanguageModel, schema, prompt).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiStructuredError)
    expect((err as AiStructuredError).usage).toEqual({ inputTokens: 10, outputTokens: 4 })
  })

  it("con structuredOutput y proveedor 'openai_compatible', pide validación estricta del esquema", async () => {
    const model = modelReturning('{"quantity":2}')
    await generateStructured(localCfg, model as unknown as LanguageModel, schema, prompt)
    expect(model.doGenerateCalls[0]?.providerOptions).toMatchObject({ openaiCompatible: { strictJsonSchema: true } })
  })

  it('sin structuredOutput, no añade providerOptions', async () => {
    const model = modelReturning('{"quantity":2}')
    await generateStructured({ ...localCfg, structuredOutput: false }, model as unknown as LanguageModel, schema, prompt)
    expect(model.doGenerateCalls[0]?.providerOptions).toBeUndefined()
  })

  it('con proveedor openai (no local), no añade providerOptions aunque structuredOutput esté activo', async () => {
    const model = modelReturning('{"quantity":2}')
    await generateStructured(openaiCfg, model as unknown as LanguageModel, schema, prompt)
    expect(model.doGenerateCalls[0]?.providerOptions).toBeUndefined()
  })
})
