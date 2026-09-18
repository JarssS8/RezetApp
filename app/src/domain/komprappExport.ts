/**
 * Exporta items de la lista de la compra de Rezet a komprapp (repo
 * `ShoppingList`, https://shop.jarsss8.es) sin llamar a su base de datos:
 * el payload viaja codificado en la URL y komprapp lo decodifica él mismo
 * al abrirla. Ver docs/superpowers/specs/2026-09-16-komprapp-shopping-export-design.md.
 */

export const KOMPRAPP_BASE_URL = 'https://shop.jarsss8.es';

export type KomprappUnit = 'g' | 'ml' | 'ud' | 'paq';

export interface KomprappExportItem {
  name: string;
  quantity: number | null;
  unit: KomprappUnit | null;
}

interface ExportableNeed {
  name: string;
  quantity: number;
  unit: string;
}

const UNIT_MAP: Record<string, KomprappUnit> = { g: 'g', ml: 'ml', ud: 'ud' };

/**
 * `shoppingNeeds()` no redondea su `gap` (resta de despensa sobre una
 * cantidad ya escalada con el exponente 0.55) — puede llegar como 333.3 o
 * 0.7. komprapp trunca hacia abajo (`Math.floor`) para g/ml/ud/paq y convierte
 * cualquier resultado <= 0 en cadena vacía (item sin cantidad, silencioso).
 * Redondeamos hacia arriba aquí para no comprar de menos ni perder el dato.
 */
function roundUp(quantity: number): number {
  return Math.ceil(quantity);
}

/** komprapp no tiene unidad "cucharada": se funde en el nombre como texto. */
export function toKomprappItem(need: ExportableNeed): KomprappExportItem {
  if (need.unit === 'tbsp') {
    const count = roundUp(need.quantity);
    const label = count === 1 ? 'cucharada' : 'cucharadas';
    return { name: `${need.name} (${count} ${label})`, quantity: null, unit: null };
  }
  return { name: need.name, quantity: roundUp(need.quantity), unit: UNIT_MAP[need.unit] ?? null };
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildKomprappImportUrl(needs: ExportableNeed[], baseUrl: string): string {
  const items = needs.map(toKomprappItem);
  const payload = toBase64Url(JSON.stringify({ v: 1, items }));
  return `${baseUrl}/#/import/${payload}`;
}
