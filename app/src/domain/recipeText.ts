import type { FoodGroup, Ingredient, Locale, PantryLoc, Recipe, Unit } from '../types';

/** Detección de ingrediente sensible por nombre (no escala linealmente). */
export const SENSITIVE_RE = /sal|salt|especia|spice|pimienta|pepper|levadura|yeast|curry/i;

/** Coincidencia exacta (insensible a mayúsculas) por nombre ES o EN — no sustituye a las sugerencias de IngredientNameField, que buscan por subcadena. */
export function findIngredientByName(list: Ingredient[], name: string): Ingredient | undefined {
  const q = name.trim().toLowerCase();
  return list.find((i) => i.name.es.toLowerCase() === q || i.name.en.toLowerCase() === q);
}

const FRESH_RE = /leche|milk|yogur|yogurt|carne|meat|pollo|chicken|pescado|fish|marisco|seafood|huevo|egg|queso|cheese|fruta|fruit|verdura|vegetable|ensalada|salad|nata|cream|mantequilla|butter|tofu/i;
const TINNED_RE = /\b(lata|conserva|bote|enlatad\w*|tinned?|canned?|jarred?)\b/i;

/** Adivina el grupo de un ingrediente nuevo por su nombre — mismo criterio que SENSITIVE_RE: heurística barata, bilingüe, el usuario corrige si hace falta. */
export function inferFoodGroup(name: string): FoodGroup {
  if (FRESH_RE.test(name)) return 'fresco';
  if (TINNED_RE.test(name)) return 'conserva';
  return 'seco';
}

/** fresco → nevera, seco/conserva → armario. Única fuente de esta regla — antes vivía duplicada en store.tsx, supabaseStore.tsx (dos veces) y esta hoja. */
export function defaultLocationFor(group: FoodGroup): PantryLoc {
  return group === 'fresco' ? 'fridge' : 'cupboard';
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ¿Menciona este texto a este ingrediente?
 *
 * Palabras de 4+ letras: se les quita el plural y se toleran 3 caracteres de
 * flexión (`lenteja` casa `lentejas`). Palabras de 3 o menos: coincidencia
 * exacta con límites de palabra — deliberado, porque `\bsal\w{0,3}\b` casaría
 * "salmón".
 */
export function textMentions(text: string, name: string): boolean {
  const hay = text.toLowerCase();
  const clean = name.toLowerCase().trim();
  if (!clean) return false;
  const candidates = [clean, ...clean.split(/\s+/).filter((w) => w.length >= 4)];
  return candidates.some((w) => {
    const re =
      w.length >= 4
        ? new RegExp(`\\b${escape(w.replace(/(es|s)$/, ''))}\\w{0,3}\\b`)
        : new RegExp(`\\b${escape(w)}\\b`);
    return re.test(hay);
  });
}

/**
 * Reparto de ingredientes por paso, como índices de `recipe.ingredients`.
 *
 * Usa `step.ingredientIds` si la receta lo trae (lo correcto en producción, con
 * la tabla `recipe_step_ingredient`). Si no, lo deduce del texto. Los
 * ingredientes que ningún paso menciona —la sal casi siempre— se cuelgan del
 * primer paso, para que nada desaparezca de la vista.
 */
export function stepIngredientMap(
  recipe: Recipe,
  ingredients: Map<string, Ingredient>,
  locale: Locale,
): number[][] {
  const map = recipe.steps.map((step) => {
    if (step.ingredientIds) {
      return step.ingredientIds
        .map((id) => recipe.ingredients.findIndex((ri) => ri.ingredientId === id))
        .filter((i) => i >= 0);
    }
    const text = step.text[locale] || step.text.es;
    return recipe.ingredients.reduce<number[]>((acc, ri, index) => {
      const ing = ingredients.get(ri.ingredientId);
      if (ing && textMentions(text, ing.name[locale] || ing.name.es)) acc.push(index);
      return acc;
    }, []);
  });

  const claimed = new Set(map.flat());
  const orphans = recipe.ingredients.map((_, i) => i).filter((i) => !claimed.has(i));
  if (orphans.length && map[0]) {
    map[0] = [...map[0], ...orphans].sort((a, b) => a - b);
  }
  return map;
}

/**
 * Un paso es "desatendido" si su temporizador es de 8 minutos o más. Es el
 * único criterio, y es el que habilita las sugerencias de paralelo.
 */
export function isPassiveStep(recipe: Recipe, index: number): boolean {
  return (recipe.steps[index]?.timerMinutes ?? 0) >= 8;
}

export interface ParsedIngredientLine {
  name: string;
  quantity: number;
  unit: Unit;
  sensitive: boolean;
}

/**
 * Una línea escrita a mano -> un ingrediente.
 * `kg` y `l` se normalizan a `g` y `ml`; sin unidad se asume `ud`.
 */
export function parseIngredientLines(text: string): ParsedIngredientLine[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([\d.,]+)\s*(g|kg|ml|l|ud|uds|pcs)?\s+(.*)$/i);
      if (!m || !m[3]) {
        return { name: line, quantity: 1, unit: 'ud' as Unit, sensitive: SENSITIVE_RE.test(line) };
      }
      let quantity = parseFloat((m[1] ?? '1').replace(',', '.'));
      let unit = (m[2] ?? 'ud').toLowerCase();
      if (unit === 'kg') {
        quantity *= 1000;
        unit = 'g';
      }
      if (unit === 'l') {
        quantity *= 1000;
        unit = 'ml';
      }
      if (unit === 'uds' || unit === 'pcs') unit = 'ud';
      const name = m[3];
      return {
        name,
        quantity: Number.isFinite(quantity) ? quantity : 1,
        unit: unit as Unit,
        sensitive: SENSITIVE_RE.test(name),
      };
    });
}

/** Un paso por línea; `N min` en el texto le pone temporizador. */
export function parseStepLines(text: string): Array<{ text: string; timerMinutes?: number }> {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/(\d+)\s*(min|minutos|minutes)/i);
      const minutes = m?.[1] ? parseInt(m[1], 10) : undefined;
      return minutes ? { text: s, timerMinutes: minutes } : { text: s };
    });
}
