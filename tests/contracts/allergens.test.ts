import { describe, expect, it } from 'vitest'
import { ALLERGENS as domainAllergens } from '@/lib/domain/allergens'
import { ALLERGENS as validationAllergens } from '@/lib/validation/household'

// Las fronteras impiden que lib/domain importe de lib/validation, así que la
// lista vive duplicada. Mismo patrón que tests/contracts/enums.test.ts.
describe('contrato de alérgenos', () => {
  it('la lista del dominio y la de validación son la misma', () => {
    expect([...domainAllergens]).toEqual([...validationAllergens])
  })
})
