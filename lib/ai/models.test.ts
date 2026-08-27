import { describe, expect, it } from 'vitest'
import { supportsPdf, supportsVision } from './models'

describe('supportsVision (regla W2-R10)', () => {
  it('anthropic: se asume soportada para cualquier id (sin catálogo propio)', () => {
    expect(supportsVision({ provider: 'anthropic', model: 'custom-model' })).toBe(true)
    expect(supportsVision({ provider: 'anthropic', model: 'otro-id-cualquiera' })).toBe(true)
  })

  it('openai: usa el flag `vision` del catálogo', () => {
    expect(supportsVision({ provider: 'openai', model: 'gpt-4o-mini' })).toBe(true)
    expect(supportsVision({ provider: 'openai', model: 'gpt-4o' })).toBe(true)
  })

  it('openai: un id desconocido no soporta visión', () => {
    expect(supportsVision({ provider: 'openai', model: 'modelo-que-no-existe' })).toBe(false)
  })

  it('openai_compatible: detecta familias de modelos de visión conocidas por el nombre', () => {
    expect(supportsVision({ provider: 'openai_compatible', model: 'qwen2-vl-7b' })).toBe(true)
    expect(supportsVision({ provider: 'openai_compatible', model: 'llava-1.6-34b' })).toBe(true)
    expect(supportsVision({ provider: 'openai_compatible', model: 'moondream2' })).toBe(true)
    expect(supportsVision({ provider: 'openai_compatible', model: 'minicpm-v-2.6' })).toBe(true)
    expect(supportsVision({ provider: 'openai_compatible', model: 'llama-3-vision-instruct' })).toBe(true)
  })

  it('openai_compatible: un modelo local sin nombre de familia de visión no la soporta', () => {
    expect(supportsVision({ provider: 'openai_compatible', model: 'qwen3-8b' })).toBe(false)
    expect(supportsVision({ provider: 'openai_compatible', model: 'qwen3-4b' })).toBe(false)
  })
})

describe('supportsPdf', () => {
  it('solo el proveedor de nube cuyo adaptador acepta documentos', () => {
    expect(supportsPdf({ provider: 'anthropic', model: 'lo-que-sea' })).toBe(true)
    expect(supportsPdf({ provider: 'openai', model: 'gpt-4o' })).toBe(false)
    expect(supportsPdf({ provider: 'openai_compatible', model: 'qwen3-8b' })).toBe(false)
    expect(supportsPdf({ provider: 'openai_compatible', model: 'llava-13b' })).toBe(false)
  })
})
