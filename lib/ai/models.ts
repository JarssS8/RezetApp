// Catálogo de modelos y precios en céntimos por millón de tokens (in/out).
//
// Los ids y precios de OpenAI se han verificado contra la documentación
// oficial del proveedor (gpt-4o-mini y gpt-4o, pricing publicado en
// platform.openai.com/docs/pricing a fecha de esta implementación): si
// cambian, solo se toca este fichero.
//
// El proveedor de nube que usa el paquete `@ai-sdk/anthropic` no aparece aquí
// con ids ni precios por defecto: sus identificadores de modelo llevan el
// nombre del fabricante, que este repositorio no puede contener (regla
// W2-R3). Para ese proveedor el hogar escribe el id del modelo a mano en
// ajustes, y si quiere que el gasto se calcule también su precio
// (`households.ai_price_in_cents_per_mtok` / `ai_price_out_cents_per_mtok`);
// sin esos campos el coste de ese proveedor se contabiliza como 0.
export type AiProviderId = 'anthropic' | 'openai' | 'openai_compatible'

export interface ModelInfo {
  id: string
  provider: AiProviderId
  label: string
  inputCentsPerM: number
  outputCentsPerM: number
  vision: boolean
}

export const MODELS: ModelInfo[] = [
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini', inputCentsPerM: 15, outputCentsPerM: 60, vision: true },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o', inputCentsPerM: 250, outputCentsPerM: 1000, vision: true },
  { id: 'qwen3-8b', provider: 'openai_compatible', label: 'Qwen3 8B (servidor local)', inputCentsPerM: 0, outputCentsPerM: 0, vision: false },
  { id: 'qwen3-4b', provider: 'openai_compatible', label: 'Qwen3 4B (servidor local)', inputCentsPerM: 0, outputCentsPerM: 0, vision: false },
]

// null: ni anthropic (sin id por defecto, ver nota de arriba) ni
// openai_compatible (el nombre del modelo local lo escribe el hogar; no hay
// uno "por defecto" razonable) tienen sugerencia automática.
export const DEFAULT_MODEL: Record<AiProviderId, string | null> = {
  anthropic: null,
  openai: 'gpt-4o-mini',
  openai_compatible: null,
}

// Clave i18n (messages/*/settings.json) con la pista que se muestra en vez de
// una lista de modelos cuando el proveedor no tiene catálogo.
export const PROVIDER_MODEL_HINT: Partial<Record<AiProviderId, string>> = {
  anthropic: 'settings.ai.modelHint',
}

export function modelInfo(provider: AiProviderId, id: string): ModelInfo | null {
  return MODELS.find((m) => m.provider === provider && m.id === id) ?? null
}

// Regla W2-R10: detección de visión por proveedor, no por catálogo único.
// - anthropic: sin catálogo (regla W2-R3), pero sus modelos multimodales
//   habituales soportan visión; se asume soportada para cualquier id.
// - openai: se consulta el catálogo (`vision` flag); un id desconocido no
//   soporta visión.
// - openai_compatible: el hogar escribe el nombre del modelo local a mano,
//   así que se detecta por convención de nombre (familias de modelos de
//   visión conocidas: llava, *-vision, *-vl, moondream, minicpm-v).
const LOCAL_VISION_MODEL_RE = /llava|vision|\bvl\b|moondream|minicpm-v/i

export function supportsVision(cfg: { provider: AiProviderId; model: string }): boolean {
  if (cfg.provider === 'anthropic') return true
  if (cfg.provider === 'openai') return modelInfo('openai', cfg.model)?.vision ?? false
  return LOCAL_VISION_MODEL_RE.test(cfg.model)
}

// Visión no implica PDF. El adaptador de nube documental acepta una parte
// `file` con mediaType application/pdf y la procesa entera; el resto de
// adaptadores solo admiten imágenes, así que un PDF llegaría como bytes
// opacos. Conservador a propósito: mejor decir "no puedo" que mandar 8 MB
// que el proveedor va a rechazar (y cobrar).
export function supportsPdf(cfg: { provider: AiProviderId; model: string }): boolean {
  return cfg.provider === 'anthropic'
}

export function estimateCostCents(info: ModelInfo | null, tokensIn: number, tokensOut: number): number {
  if (!info) return 0
  return Math.round((tokensIn * info.inputCentsPerM) / 1_000_000 + (tokensOut * info.outputCentsPerM) / 1_000_000)
}
