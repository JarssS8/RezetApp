/**
 * Autenticación del cron: `null` si la petición trae el secreto correcto en
 * `x-rezet-cron`, si no el código HTTP con que rechazarla. Falla cerrado: sin
 * `TIMER_CRON_SECRET` configurado no pasa nadie (503), porque la publishable
 * key que también llega hasta aquí viaja en el bundle del cliente.
 */
export function cronAuthStatus(expected: string | undefined, got: string | null): 401 | 503 | null {
  if (!expected) return 503;
  if (got === null || !timingSafeEqual(expected, got)) return 401;
  return null;
}

/** Compara sin salir antes en el primer byte distinto (solo deja ver la longitud). */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
