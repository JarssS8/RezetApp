// Salida estructurada: generateObject + zod, con reintentos ante fallos
// transitorios del proveedor (`maxRetries: 2`). Con modelos ≤ 8B conviene un
// prompt corto que pida un único objeto JSON, sin cadena de herramientas
// (spec §10). Con salida estructurada activada y proveedor 'openai_compatible'
// se pide validación estricta del esquema (grado máximo de cumplimiento que
// admite ese adaptador en llamadas por-petición: el modo de gramática GBNF en
// sí depende de cómo se construyó el modelo en lib/ai/provider.ts).
import { generateObject, NoObjectGeneratedError } from 'ai'
import type { LanguageModel, ModelMessage } from 'ai'
import type { z } from 'zod'
import type { AiConfig } from './provider'

// Uso real reportado por el proveedor aunque la llamada haya fallado (p. ej. el
// modelo generó texto pero no un objeto válido): withBudget lo usa para registrar
// el gasto real en vez de una fila a 0 tokens cuando fn(model) lanza (fix 5 de la
// revisión final). undefined cuando el proveedor no reportó ningún uso.
export interface AiUsage {
  inputTokens: number
  outputTokens: number
}

export class AiStructuredError extends Error {
  readonly code = 'ai_invalid_output'
  readonly usage: AiUsage | undefined
  constructor(message = 'El modelo no devolvió un objeto válido', usage?: AiUsage) {
    super(message)
    this.name = 'AiStructuredError'
    this.usage = usage
  }
}

// NoObjectGeneratedError (AI SDK) adjunta el `usage` de la llamada aunque no
// haya podido validar la salida como objeto; otros errores (de red, del
// proveedor) no lo traen.
function usageFromError(err: unknown): AiUsage | undefined {
  if (!NoObjectGeneratedError.isInstance(err)) return undefined
  const usage = err.usage
  if (!usage) return undefined
  return { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 }
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
    throw new AiStructuredError(err instanceof Error ? err.message : 'Error desconocido', usageFromError(err))
  }
}
