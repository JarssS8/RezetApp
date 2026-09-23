// `quiet.ts` es TypeScript puro (sin ninguna API de Deno), así que se testea
// con vitest como el resto del repo — `npm test` lo recoge y lo corre en
// CI. Antes se probó con `Deno.test`, pero CI solo ejecuta `deno check`
// (tipos) para las Edge Functions, no `deno test`: esos casos límite de la
// franja de medianoche se quedaban sin red automática que los protegiera.
import { describe, expect, it } from 'vitest';
import { isQuiet, localMinutes } from './quiet.ts';

/**
 * Un instante que en **Madrid** son las `hour:minute` del 1 de enero de 2026.
 * En enero Madrid va en UTC+1, así que el instante UTC es una hora antes.
 *
 * Se construye por UTC y no con componentes locales a propósito: con
 * componentes locales el test pasaba igual con `TZ=UTC` que con
 * `TZ=Europe/Madrid`, así que no habría notado que la función leía la hora
 * del proceso en vez de la del hogar — que es justo el fallo que tenía.
 */
function madrid(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, hour - 1, minute));
}

const at = madrid;

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

  it('la hora es la del hogar, no la del proceso', () => {
    // Las Edge Functions corren en UTC. Este instante son las 23:30 en Madrid
    // y las 22:30 en UTC: con la franja de 23:00 a 08:00, leer la hora del
    // proceso daría "no hay silencio" justo cuando la persona duerme.
    const nocheDeMadrid = new Date(Date.UTC(2026, 0, 1, 22, 30));
    expect(localMinutes(nocheDeMadrid, 'Europe/Madrid')).toBe(23 * 60 + 30);
    expect(localMinutes(nocheDeMadrid, 'UTC')).toBe(22 * 60 + 30);
    expect(isQuiet(nocheDeMadrid, '23:00', '08:00')).toBe(true);
    expect(isQuiet(nocheDeMadrid, '23:00', '08:00', 'UTC')).toBe(false);
  });

  it('medianoche del hogar cuenta como 0 minutos, no como 1440', () => {
    expect(localMinutes(new Date(Date.UTC(2025, 11, 31, 23, 0)), 'Europe/Madrid')).toBe(0);
  });
});
