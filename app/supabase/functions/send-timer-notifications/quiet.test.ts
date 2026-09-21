// Tests de `isQuiet` con el runner nativo de Deno (`Deno.test`), no vitest:
// este fichero vive en una Edge Function, fuera del `tsconfig` de la app
// (`include: ["src"]`), así que `npm run lint`/`npm test` no lo tocan. Se
// corre con:
//   npx --yes deno@2 test --no-check --node-modules-dir=none supabase/functions/send-timer-notifications/quiet.test.ts
//
// Sin dependencias externas (ni `jsr:@std/assert` ni `npm:vitest`): un
// `assert`/`assertEquals` caseros bastan para cuatro comprobaciones de
// booleanos y evitan tirar de red al resolver el import.
import { isQuiet } from "./quiet.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: boolean, expected: boolean, message: string): void {
  assert(actual === expected, `${message}: se esperaba ${expected}, salió ${actual}`);
}

function at(hour: number, minute: number): Date {
  // Componentes locales (no ISO/UTC): así el test no depende de la zona
  // horaria de la máquina que lo ejecuta.
  return new Date(2026, 0, 1, hour, minute);
}

Deno.test("sin franja configurada, nunca hay silencio", () => {
  assertEquals(isQuiet(at(23, 30), null, null), false, "from y to nulos");
  assertEquals(isQuiet(at(23, 30), "22:00", null), false, "solo from");
  assertEquals(isQuiet(at(23, 30), null, "08:00"), false, "solo to");
});

Deno.test("franja normal dentro del mismo día (22:00-23:00)", () => {
  assertEquals(isQuiet(at(22, 30), "22:00", "23:00"), true, "dentro de la franja");
  assertEquals(isQuiet(at(21, 59), "22:00", "23:00"), false, "justo antes de empezar");
  assertEquals(isQuiet(at(23, 1), "22:00", "23:00"), false, "justo después de terminar");
});

Deno.test("franja que cruza la medianoche (23:00-08:00), a ambos lados de las 00:00", () => {
  assertEquals(isQuiet(at(23, 30), "23:00", "08:00"), true, "antes de medianoche");
  assertEquals(isQuiet(at(0, 30), "23:00", "08:00"), true, "después de medianoche");
  assertEquals(isQuiet(at(7, 59), "23:00", "08:00"), true, "justo antes de terminar");
  assertEquals(isQuiet(at(12, 0), "23:00", "08:00"), false, "a mediodía, fuera de la franja");
});

Deno.test("bordes exactos: la hora de inicio SÍ es silencio, la de fin NO", () => {
  // Franja normal.
  assertEquals(isQuiet(at(22, 0), "22:00", "23:00"), true, "inicio incluido (normal)");
  assertEquals(isQuiet(at(23, 0), "22:00", "23:00"), false, "fin excluido (normal)");
  // Franja que cruza la medianoche.
  assertEquals(isQuiet(at(23, 0), "23:00", "08:00"), true, "inicio incluido (cruza medianoche)");
  assertEquals(isQuiet(at(8, 0), "23:00", "08:00"), false, "fin excluido (cruza medianoche)");
});

Deno.test("from y to iguales: franja degenerada, se trata como si no hubiera franja", () => {
  assertEquals(isQuiet(at(22, 0), "22:00", "22:00"), false, "misma hora en los dos campos");
});
