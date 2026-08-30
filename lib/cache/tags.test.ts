import { describe, expect, it, vi } from 'vitest'

// tags.ts importa "server-only" (guardia de Next): fuera de webpack lanza a
// propósito, tal como documenta tests/contracts/api-surface.test.ts. Aquí no
// se invoca ningún render ni ruta: basta con que el import no reviente.
// vi.mock se iza sobre los imports de módulo, así que este import estático
// de './tags' sí que llega a cargar el módulo real (sin "server-only").
vi.mock('server-only', () => ({}))

import { CACHE_SCOPES, householdTag, invalidateHousehold } from './tags'

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111'

describe('etiquetas de caché', () => {
  it('son cinco ámbitos, y el hogar va delante del ámbito', () => {
    expect([...CACHE_SCOPES]).toEqual(['recipes', 'plan', 'pantry', 'foods', 'settings'])
    expect(householdTag(HOUSEHOLD, 'plan')).toBe(`h:${HOUSEHOLD}:plan`)
  })

  it('no se acerca al límite de 256 caracteres de cacheTag', () => {
    for (const scope of CACHE_SCOPES) expect(householdTag(HOUSEHOLD, scope).length).toBeLessThan(64)
  })

  it('dos hogares nunca comparten etiqueta', () => {
    const other = '22222222-2222-4222-8222-222222222222'
    expect(householdTag(HOUSEHOLD, 'pantry')).not.toBe(householdTag(other, 'pantry'))
  })

  it('fuera de una petición no lanza: no hay caché que invalidar', () => {
    // Este mismo test es el que corre en vitest, sin work store de Next: si
    // invalidateHousehold no tragara el invariante E263, los ~25 ficheros de
    // lib/services/**.test.ts se pondrían rojos en cuanto la Tarea 3 conecte
    // la invalidación. Y son ellos, no este test, la prueba de fuego.
    expect(() => invalidateHousehold(HOUSEHOLD, ['plan', 'pantry'])).not.toThrow()
  })
})
