import { describe, expect, it } from 'vitest'
import type { LanguageModel } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type { AiConfig } from '../provider'
import { estimateNutrition } from './estimate-nutrition'
import { AiUnsupportedError, importRecipeFromImageAi, importRecipeFromTextAi } from './import-recipe'
import { parseIngredientsFallback } from './parse-ingredients'
import { estimateNutritionSystemPrompt, importRecipeSystemPrompt, parseIngredientsSystemPrompt } from './prompts'

const openaiCfg: AiConfig = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test', baseUrl: null, structuredOutput: true }
const localCfg: AiConfig = { provider: 'openai_compatible', model: 'qwen3-8b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: true }
const anthropicCfg: AiConfig = { provider: 'anthropic', model: 'custom-model', apiKey: 'sk-test', baseUrl: null, structuredOutput: true }
const localVisionCfg: AiConfig = { provider: 'openai_compatible', model: 'qwen2-vl-7b', apiKey: null, baseUrl: 'http://localhost:8080/v1', structuredOutput: true }
const openaiUnknownCfg: AiConfig = { provider: 'openai', model: 'modelo-que-no-existe', apiKey: 'sk-test', baseUrl: null, structuredOutput: true }

// El uso del mock (10 tokens de entrada, 4 de salida) es el mismo en todas
// las llamadas: sirve para comprobar que cada tarea propaga el `usage` real
// de `generateStructured` en vez de descartarlo (ver lib/services/ai-tasks.ts).
const MOCK_USAGE = { inputTokens: 10, outputTokens: 4 }

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

describe('prompts', () => {
  it('parseIngredientsSystemPrompt es/en son cortos y llevan la regla de no inventar cantidades', () => {
    expect(parseIngredientsSystemPrompt('es')).toContain('No inventes cantidades')
    expect(parseIngredientsSystemPrompt('en')).toContain('Do not invent quantities')
    expect(parseIngredientsSystemPrompt('es').split('\n').length).toBeLessThanOrEqual(6)
    expect(parseIngredientsSystemPrompt('en').split('\n').length).toBeLessThanOrEqual(6)
  })

  it('importRecipeSystemPrompt es/en no piden calcular cantidades', () => {
    expect(importRecipeSystemPrompt('es')).toContain('No calcules cantidades')
    expect(importRecipeSystemPrompt('en')).toContain('Do not compute quantities')
  })

  it('estimateNutritionSystemPrompt es/en documentan gramsPerUnit', () => {
    expect(estimateNutritionSystemPrompt('es')).toContain('gramsPerUnit')
    expect(estimateNutritionSystemPrompt('en')).toContain('gramsPerUnit')
  })
})

describe('parseIngredientsFallback', () => {
  it('sin líneas, no llama al modelo y devuelve [] con uso en cero', async () => {
    const model = modelReturning('{"lines":[]}')
    const { result, usage } = await parseIngredientsFallback(openaiCfg, model as unknown as LanguageModel, [], 'es')
    expect(result).toEqual([])
    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('construye el prompt del sistema correcto y manda las líneas numeradas', async () => {
    const model = modelReturning('{"lines":[{"quantity":2,"unit":"cucharadas","foodName":"aceite de oliva","preparation":null}]}')
    await parseIngredientsFallback(openaiCfg, model as unknown as LanguageModel, ['2 cucharadas de aceite de oliva'], 'es')
    const call = model.doGenerateCalls[0]
    const systemMessage = call?.prompt.find((m) => m.role === 'system')
    expect(systemMessage?.content).toBe(parseIngredientsSystemPrompt('es'))
    const userMessage = call?.prompt.find((m) => m.role === 'user')
    expect(userMessage?.content).toEqual([{ type: 'text', text: '1. 2 cucharadas de aceite de oliva' }])
  })

  it('mapea unidad reconocida ("cucharadas" -> tbsp), needsReview false con cantidad+alimento, y propaga el usage real', async () => {
    const model = modelReturning('{"lines":[{"quantity":2,"unit":"cucharadas","foodName":"aceite de oliva","preparation":null}]}')
    const { result, usage } = await parseIngredientsFallback(openaiCfg, model as unknown as LanguageModel, ['2 cucharadas de aceite de oliva'], 'es')
    expect(result).toEqual([{ quantity: 2, unit: 'tbsp', foodName: 'aceite de oliva', preparation: null, confidence: 0.5, needsReview: false }])
    expect(usage).toEqual(MOCK_USAGE)
  })

  it('unidad no reconocida -> unit null; sin cantidad -> needsReview true', async () => {
    const model = modelReturning('{"lines":[{"quantity":null,"unit":"a ojo","foodName":"sal","preparation":null}]}')
    const { result } = await parseIngredientsFallback(openaiCfg, model as unknown as LanguageModel, ['sal a ojo'], 'es')
    expect(result).toEqual([{ quantity: null, unit: null, foodName: 'sal', preparation: null, confidence: 0.5, needsReview: true }])
  })

  it('sin unidad en la línea de entrada, unit queda null sin llamar a findUnit', async () => {
    const model = modelReturning('{"lines":[{"quantity":1,"unit":null,"foodName":"cebolla","preparation":"picada"}]}')
    const { result } = await parseIngredientsFallback(openaiCfg, model as unknown as LanguageModel, ['1 cebolla picada'], 'es')
    expect(result).toEqual([{ quantity: 1, unit: null, foodName: 'cebolla', preparation: 'picada', confidence: 0.5, needsReview: false }])
  })
})

describe('importRecipeFromTextAi', () => {
  it('construye el prompt del sistema correcto', async () => {
    const model = modelReturning(
      '{"title":"Tortilla","description":null,"servingsBase":2,"prepMinutes":5,"cookMinutes":10,"difficulty":"easy","tags":[],"ingredients":[{"rawText":"4 huevos"}],"steps":[{"text":"Bate los huevos","timerSeconds":null}]}',
    )
    await importRecipeFromTextAi(openaiCfg, model as unknown as LanguageModel, 'Tortilla de 4 huevos...', 'es')
    const systemMessage = model.doGenerateCalls[0]?.prompt.find((m) => m.role === 'system')
    expect(systemMessage?.content).toBe(importRecipeSystemPrompt('es'))
  })

  it('mapea la salida a un RecipeInput con rawText y sin foodId/quantity/unit, y propaga el usage real', async () => {
    const model = modelReturning(
      '{"title":"Tortilla","description":null,"servingsBase":2,"prepMinutes":5,"cookMinutes":10,"difficulty":"easy","tags":["rápido"],"ingredients":[{"rawText":"4 huevos"},{"rawText":"sal al gusto"}],"steps":[{"text":"Bate los huevos","timerSeconds":null},{"text":"Cuaja en la sartén","timerSeconds":180}]}',
    )
    const { result, usage } = await importRecipeFromTextAi(openaiCfg, model as unknown as LanguageModel, 'texto de la receta', 'es')
    expect(result).toEqual({
      title: 'Tortilla',
      description: null,
      servingsBase: 2,
      prepMinutes: 5,
      cookMinutes: 10,
      difficulty: 'easy',
      imageUrls: [],
      notes: undefined,
      sourceUrl: undefined,
      yieldGrams: undefined,
      tags: ['rápido'],
      ingredients: [
        { rawText: '4 huevos', scalesLinearly: true },
        { rawText: 'sal al gusto', scalesLinearly: true },
      ],
      steps: [
        { text: 'Bate los huevos', timerSeconds: null },
        { text: 'Cuaja en la sartén', timerSeconds: 180 },
      ],
    })
    expect(usage).toEqual(MOCK_USAGE)
    for (const ingredient of result.ingredients) {
      expect(ingredient).not.toHaveProperty('foodId')
      expect(ingredient).not.toHaveProperty('quantity')
      expect(ingredient).not.toHaveProperty('unit')
    }
  })
})

describe('importRecipeFromImageAi', () => {
  it('con un modelo sin vision, lanza AiUnsupportedError (ai_unsupported) sin llamar al modelo', async () => {
    const model = modelReturning('{}')
    const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }
    await expect(importRecipeFromImageAi(localCfg, model as unknown as LanguageModel, image, 'es')).rejects.toMatchObject({ code: 'ai_unsupported' })
    await expect(importRecipeFromImageAi(localCfg, model as unknown as LanguageModel, image, 'es')).rejects.toBeInstanceOf(AiUnsupportedError)
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('con un modelo con vision, manda la imagen como file part y propaga el usage real', async () => {
    const model = modelReturning(
      '{"title":"Tortilla","description":null,"servingsBase":2,"prepMinutes":null,"cookMinutes":null,"difficulty":null,"tags":[],"ingredients":[{"rawText":"4 huevos"}],"steps":[{"text":"Bate los huevos","timerSeconds":null}]}',
    )
    const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }
    const { result, usage } = await importRecipeFromImageAi(openaiCfg, model as unknown as LanguageModel, image, 'es')
    expect(result.title).toBe('Tortilla')
    expect(result.ingredients).toEqual([{ rawText: '4 huevos', scalesLinearly: true }])
    expect(usage).toEqual(MOCK_USAGE)

    const userMessage = model.doGenerateCalls[0]?.prompt.find((m) => m.role === 'user')
    expect(userMessage?.content).toEqual([
      expect.objectContaining({ type: 'text', text: 'Esta es la foto de una receta de cocina.' }),
      expect.objectContaining({ type: 'file', data: { type: 'data', data: image.bytes }, mediaType: 'image/jpeg' }),
    ])
  })

  it('con anthropic, se permite cualquier id de modelo (regla W2-R10)', async () => {
    const model = modelReturning(
      '{"title":"Tortilla","description":null,"servingsBase":2,"prepMinutes":null,"cookMinutes":null,"difficulty":null,"tags":[],"ingredients":[{"rawText":"4 huevos"}],"steps":[{"text":"Bate los huevos","timerSeconds":null}]}',
    )
    const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }
    const { result } = await importRecipeFromImageAi(anthropicCfg, model as unknown as LanguageModel, image, 'es')
    expect(result.title).toBe('Tortilla')
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('con un modelo local de visión conocido (qwen2-vl-7b), se permite', async () => {
    const model = modelReturning(
      '{"title":"Tortilla","description":null,"servingsBase":2,"prepMinutes":null,"cookMinutes":null,"difficulty":null,"tags":[],"ingredients":[{"rawText":"4 huevos"}],"steps":[{"text":"Bate los huevos","timerSeconds":null}]}',
    )
    const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }
    const { result } = await importRecipeFromImageAi(localVisionCfg, model as unknown as LanguageModel, image, 'es')
    expect(result.title).toBe('Tortilla')
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('con openai y un id de modelo desconocido, lanza AiUnsupportedError sin llamar al modelo', async () => {
    const model = modelReturning('{}')
    const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }
    await expect(importRecipeFromImageAi(openaiUnknownCfg, model as unknown as LanguageModel, image, 'es')).rejects.toMatchObject({
      code: 'ai_unsupported',
    })
    expect(model.doGenerateCalls).toHaveLength(0)
  })
})

describe('estimateNutrition', () => {
  it('construye el prompt del sistema correcto, devuelve la estimación y propaga el usage real', async () => {
    const model = modelReturning('{"kcal100g":52,"protein100g":0.3,"carbs100g":14,"fat100g":0.2,"fiber100g":2.4,"defaultUnit":"g","gramsPerUnit":null}')
    const { result, usage } = await estimateNutrition(openaiCfg, model as unknown as LanguageModel, 'manzana', 'es')
    expect(result).toEqual({ kcal100g: 52, protein100g: 0.3, carbs100g: 14, fat100g: 0.2, fiber100g: 2.4, defaultUnit: 'g', gramsPerUnit: null })
    expect(usage).toEqual(MOCK_USAGE)
    const systemMessage = model.doGenerateCalls[0]?.prompt.find((m) => m.role === 'system')
    expect(systemMessage?.content).toBe(estimateNutritionSystemPrompt('es'))
  })
})
