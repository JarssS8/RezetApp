/**
 * ¿Alcanza lo que hay en la despensa?
 *
 * La tolerancia de 0.999 evita falsos negativos por coma flotante: sin ella,
 * "necesito 300 g y tengo 300 g" puede dar no cubierto.
 */
export function isCovered(need: number, inPantry: number): boolean {
  return inPantry >= need * 0.999;
}

/** Cobertura de una lista de pares necesidad/existencias. */
export function coverageOf(pairs: Array<{ need: number; have: number }>): {
  have: number;
  total: number;
  full: boolean;
} {
  const have = pairs.filter((p) => isCovered(p.need, p.have)).length;
  return { have, total: pairs.length, full: pairs.length > 0 && have === pairs.length };
}
