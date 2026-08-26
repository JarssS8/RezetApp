import { describe, expect, it } from 'vitest'
import { BASE_UNITS, LOCALES, UNIT_SYSTEMS } from './types'

// Las listas en tiempo de ejecución son el origen de los tipos Locale, BaseUnit
// y UnitSystem; tests/contracts/enums.test.ts las compara con los pgEnum y con
// las de lib/prefs.ts y lib/auth/ctx.ts.
describe('listas base del dominio', () => {
  it('idiomas, unidades base y sistemas de unidades', () => {
    expect([...LOCALES]).toEqual(['es', 'en'])
    expect([...BASE_UNITS]).toEqual(['g', 'ml', 'ud'])
    expect([...UNIT_SYSTEMS]).toEqual(['metric', 'imperial'])
  })
})
