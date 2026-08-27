// Prompts de sistema por tarea y locale. Cortos (≤ 6 líneas), un único
// objeto JSON de salida, sin cálculo de totales ni escalado (regla 2 de
// AGENTS.md: el modelo no calcula, solo extrae/estima texto libre).
import type { Locale } from '@/lib/domain/types'

export function parseIngredientsSystemPrompt(locale: Locale): string {
  if (locale === 'es') {
    return [
      'Analizas líneas de ingredientes de una receta de cocina.',
      'Para cada línea, extrae cantidad, unidad, nombre del alimento y preparación.',
      'No inventes cantidades: usa null si no aparece en el texto.',
      'No calcules totales ni conviertas unidades.',
      'Devuelve un único objeto JSON con una entrada por línea, en el mismo orden.',
    ].join('\n')
  }
  return [
    'You parse ingredient lines from a cooking recipe.',
    'For each line, extract quantity, unit, food name and preparation.',
    'Do not invent quantities: use null if it does not appear in the text.',
    'Do not compute totals or convert units.',
    'Return a single JSON object with one entry per line, in the same order.',
  ].join('\n')
}

export function importRecipeSystemPrompt(locale: Locale): string {
  if (locale === 'es') {
    return [
      'Extraes el título, pasos e ingredientes de una receta de cocina.',
      'Copia el texto de cada ingrediente tal cual aparece, sin resolverlo.',
      'No inventes datos que no aparezcan en la fuente: usa null si faltan.',
      'No calcules cantidades ni escalas la receta.',
      'Devuelve un único objeto JSON con la receta.',
    ].join('\n')
  }
  return [
    'You extract the title, steps and ingredients of a cooking recipe.',
    'Copy each ingredient line as it appears, without resolving it.',
    "Do not invent data that isn't in the source: use null if missing.",
    'Do not compute quantities or scale the recipe.',
    'Return a single JSON object with the recipe.',
  ].join('\n')
}

// Texto breve que acompaña al fichero en `importRecipeFromImageAi` y
// `importRecipeFromPdfAi` (algunos adaptadores esperan al menos un `text`
// part junto al `file` part). Genérico porque lo reutilizan ambas: puede ser
// una foto o un documento PDF.
export function importRecipeImageUserText(locale: Locale): string {
  return locale === 'es' ? 'Esta es una foto o un documento de una receta de cocina.' : 'This is a photo or document of a cooking recipe.'
}

export function estimateNutritionSystemPrompt(locale: Locale): string {
  if (locale === 'es') {
    return [
      'Estimas valores nutricionales típicos por 100 g o 100 ml de un alimento.',
      'Da tu mejor estimación aunque no sea exacta; no dejes campos vacíos.',
      "`gramsPerUnit` solo si `defaultUnit` es 'ud'; si no, null.",
      'No calcules totales de una receta, solo el alimento indicado.',
      'Devuelve un único objeto JSON.',
    ].join('\n')
  }
  return [
    'You estimate typical nutrition values per 100 g or 100 ml of a food.',
    "Give your best estimate even if it isn't exact; do not leave fields empty.",
    "`gramsPerUnit` only when `defaultUnit` is 'ud'; otherwise null.",
    'Do not compute totals for a recipe, only the given food.',
    'Return a single JSON object.',
  ].join('\n')
}

// Prompt de "Planificar la semana" (spec §5 / §10): el modelo decide QUÉ
// receta va en cada (fecha, hueco), nunca CUÁNTO (raciones/kcal las pone el
// código después de recibir la respuesta).
export function proposePlanSystemPrompt(locale: Locale): string {
  if (locale === 'es') {
    return [
      'Planificas comidas de una semana para un hogar a partir de sus recetas.',
      'Elige solo ids de receta que aparezcan en la lista que te doy; no inventes ids.',
      'No repitas una receta cocinada en los últimos 7 días si puedes evitarlo.',
      'Prioriza recetas que usen alimentos de la despensa que caducan pronto.',
      'Respeta los alérgenos y preferencias indicadas; no propongas nada que los contenga.',
      'No calcules raciones ni calorías: eso no es parte de tu respuesta.',
    ].join('\n')
  }
  return [
    'You plan a week of meals for a household from its recipes.',
    'Only pick recipe ids that appear in the list I give you; never invent ids.',
    'Avoid repeating a recipe cooked in the last 7 days when you can.',
    'Prefer recipes that use pantry foods that expire soon.',
    "Respect the given allergens and preferences; never propose something that contains them.",
    'Do not compute servings or calories: that is not part of your answer.',
  ].join('\n')
}
