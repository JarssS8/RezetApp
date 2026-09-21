// `quiet.ts` es TypeScript puro (sin ninguna API de Deno), así que se testea
// con vitest como el resto del repo — `npm test` lo recoge y lo corre en
// CI. Antes se probó con `Deno.test`, pero CI solo ejecuta `deno check`
// (tipos) para las Edge Functions, no `deno test`: esos casos límite de la
// franja de medianoche se quedaban sin red automática que los protegiera.
import { describe, expect, it } from 'vitest';
import { isQuiet } from './quiet.ts';

function at(hour: number, minute: number): Date {
  // Componentes locales (no ISO/UTC): así el test no depende de la zona
  // horaria de la máquina que lo ejecuta.
  return new Date(2026, 0, 1, hour, minute);
}

describe('isQuiet', () => {
  it('sin franja configurada, nunca hay silencio', () => {
    expect(isQuiet(at(23, 30), null, null)).toBe(false);
    expect(isQuiet(at(23, 30), '22:00', null)).toBe(false);
    expect(isQuiet(at(23, 30), null, '08:00')).toBe(false);
  });

  it('franja normal dentro del mismo día (22:00-23:00)', () => {
    expect(isQuiet(at(22, 30), '22:00', '23:00')).toBe(true);
    expect(isQuiet(at(21, 59), '22:00', '23:00')).toBe(false);
    expect(isQuiet(at(23, 1), '22:00', '23:00')).toBe(false);
  });

  it('franja que cruza la medianoche (23:00-08:00), a ambos lados de las 00:00', () => {
    expect(isQuiet(at(23, 30), '23:00', '08:00')).toBe(true);
    expect(isQuiet(at(0, 30), '23:00', '08:00')).toBe(true);
    expect(isQuiet(at(7, 59), '23:00', '08:00')).toBe(true);
    expect(isQuiet(at(12, 0), '23:00', '08:00')).toBe(false);
  });

  it('bordes exactos: la hora de inicio SÍ es silencio, la de fin NO', () => {
    // Franja normal.
    expect(isQuiet(at(22, 0), '22:00', '23:00')).toBe(true);
    expect(isQuiet(at(23, 0), '22:00', '23:00')).toBe(false);
    // Franja que cruza la medianoche.
    expect(isQuiet(at(23, 0), '23:00', '08:00')).toBe(true);
    expect(isQuiet(at(8, 0), '23:00', '08:00')).toBe(false);
  });

  it('from y to iguales: franja degenerada, se trata como si no hubiera franja', () => {
    expect(isQuiet(at(22, 0), '22:00', '22:00')).toBe(false);
  });
});
