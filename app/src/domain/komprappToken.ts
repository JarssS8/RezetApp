/**
 * Extrae el token de una lista de komprapp (repo `ShoppingList`) a partir
 * de lo que el usuario pegue: un enlace completo (`/#/s/<token>` o
 * `/shared/<token>`) o el token pelado. Espejo puro, en este repo, de
 * `extractToken()` en `ShoppingList/src/smart-input.jsx` — debe aceptar los
 * mismos formatos, pero no comparte código con ese repo (no hay import
 * cruzado entre los dos proyectos).
 */
const TOKEN_RE = /\/(?:s|shared)\/([^/?#&\s]+)/i;

export function extractKomprappToken(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const hashMatch = u.hash.match(TOKEN_RE);
    if (hashMatch?.[1]) return hashMatch[1].toLowerCase();
    const pathMatch = u.pathname.match(TOKEN_RE);
    if (pathMatch?.[1]) return pathMatch[1].toLowerCase();
  } catch {
    /* no era una URL completa */
  }
  const m = s.match(TOKEN_RE);
  if (m?.[1]) return m[1].toLowerCase();
  return s.toLowerCase();
}
