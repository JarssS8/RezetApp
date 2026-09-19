import type { Unit } from '../types';

/** Forma mínima de la respuesta de `GET /api/v2/product/{code}.json` de Open Food Facts. */
export interface OffApiResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_quantity?: string | number;
    product_quantity_unit?: string;
  };
}

/**
 * Mapea una respuesta de Open Food Facts a los campos del formulario manual.
 * Nunca reenvía el string de unidad de OFF tal cual: `Unit` es un union
 * cerrado ('g'|'ml'|'ud') y un string libre como "kg" rompería el matching
 * de stock/shopping en `store.tsx` (`p.unit === need.unit`) en silencio.
 */
export function mapOpenFoodFactsProduct(raw: OffApiResponse): { name: string; quantity: number; unit: Unit } | null {
  const product = raw.product;
  const name = sanitizeExternalName(product?.product_name ?? '');
  if (raw.status !== 1 || !name) return null;

  const rawUnit = (product?.product_quantity_unit ?? '').toLowerCase().trim();
  const rawQty = Number(product?.product_quantity);

  if (Number.isFinite(rawQty) && rawQty > 0) {
    switch (rawUnit) {
      case 'g':
        return { name, quantity: rawQty, unit: 'g' };
      case 'kg':
        return { name, quantity: rawQty * 1000, unit: 'g' };
      case 'ml':
        return { name, quantity: rawQty, unit: 'ml' };
      case 'l':
        return { name, quantity: rawQty * 1000, unit: 'ml' };
      case 'cl':
        return { name, quantity: rawQty * 10, unit: 'ml' };
    }
  }
  return { name, quantity: 1, unit: 'ud' };
}

const VALID_UNITS: readonly Unit[] = ['g', 'ml', 'ud'];

/** Largo máximo de un nombre de producto que llega de fuera. */
export const EXTERNAL_NAME_MAX = 120;

/**
 * Nombre de producto venido de un tercero (Open Food Facts, que edita
 * cualquiera, o el modelo leyendo una etiqueta): acaba como nombre de
 * ingrediente del hogar y en el contexto del asistente de IA de sus
 * miembros. Se quitan caracteres invisibles y de formato (bidi, anchura
 * cero), los de control y los saltos de línea pasan a ser un espacio, se juntan
 * los espacios y se corta a {@link EXTERNAL_NAME_MAX}. Lo que queda es lo que ve el campo.
 */
export function sanitizeExternalName(raw: string): string {
  return Array.from(
    raw
      .replace(/\p{Cf}/gu, '')
      .replace(/[\s\p{Cc}]+/gu, ' ')
      .trim(),
  )
    .slice(0, EXTERNAL_NAME_MAX)
    .join('')
    .trimEnd();
}

export interface RecognizedPantryItem {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  expiresOn: string | null;
}

/**
 * Valida defensivamente el JSON que devuelve Gemini antes de tocarlo — un
 * modelo puede devolver tipos equivocados o campos de más; cualquier campo
 * con forma incorrecta se descarta a `null` en vez de intentar adivinar.
 */
export function mapGeminiRecognition(raw: unknown): RecognizedPantryItem | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? sanitizeExternalName(r.name) : '';
  if (!name) return null;

  const quantity = typeof r.quantity === 'number' && r.quantity > 0 ? r.quantity : null;
  const unit = typeof r.unit === 'string' && (VALID_UNITS as string[]).includes(r.unit) ? (r.unit as Unit) : null;
  const expiresOn =
    typeof r.expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn) ? r.expiresOn : null;

  return { name, quantity, unit, expiresOn };
}
