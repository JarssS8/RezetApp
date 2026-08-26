// Salida estructurada: generateObject + zod, con reintentos ante fallos
// transitorios del proveedor (`maxRetries: 2`). Con modelos ≤ 8B conviene un
// prompt corto que pida un único objeto JSON, sin cadena de herramientas
// (spec §10). Con salida estructurada activada y proveedor 'openai_compatible'
// se pide validación estricta del esquema (grado máximo de cumplimiento que
// admite ese adaptador en llamadas por-petición: el modo de gramática GBNF en
// sí depende de cómo se construyó el modelo en lib/ai/provider.ts).
import { generateObject } from 'ai'
import type { LanguageModel, ModelMessage } from 'ai'
import type { z } from 'zod'
import type { AiConfig } from './provider'

export class AiStructuredError extends Error {
  readonly code = 'ai_invalid_output'
  constructor(message = 'El modelo no devolvió un objeto válido') {
    super(message)
    this.name = 'AiStructuredError'
  }
}

export interface StructuredPrompt {
  system: string
  // Texto simple, o lista de mensajes cuando hace falta contenido multimodal
  // (p. ej. `importRecipeFromImageAi` adjuntando la foto como `file` part).
  user: string | ModelMessage[]
}

export interface StructuredResult<T> {
  result: T
  usage: { inputTokens: number; outputTokens: number }
}

export async function generateStructured<S extends z.ZodType>(
  cfg: AiConfig,
  model: LanguageModel,
  schema: S,
  prompt: StructuredPrompt,
): Promise<StructuredResult<z.infer<S>>> {
  const useStrictJsonSchema = cfg.structuredOutput && cfg.provider === 'openai_compatible'

  try {
    const { object, usage } = await generateObject({
      model,
      schema,
      system: prompt.system,
      prompt: prompt.user,
      maxRetries: 2,
      ...(useStrictJsonSchema ? { providerOptions: { openaiCompatible: { strictJsonSchema: true } } } : {}),
    })
    return { result: object as z.infer<S>, usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } }
  } catch (err) {
    throw new AiStructuredError(err instanceof Error ? err.message : 'Error desconocido')
  }
}
