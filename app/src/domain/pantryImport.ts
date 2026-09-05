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
  const name = product?.product_name?.trim();
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

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;

  const quantity = typeof r.quantity === 'number' && r.quantity > 0 ? r.quantity : null;
  const unit = typeof r.unit === 'string' && (VALID_UNITS as string[]).includes(r.unit) ? (r.unit as Unit) : null;
  const expiresOn =
    typeof r.expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn) ? r.expiresOn : null;

  return { name, quantity, unit, expiresOn };
}
