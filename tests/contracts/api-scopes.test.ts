import { describe, expect, it } from 'vitest'
import { API_SCOPES as dbScopes } from '@/db/schema/tokens'
import { API_SCOPES as validationScopes } from '@/lib/validation/tokens'

// lib/validation no puede importar de db/** (fronteras eslint) y viceversa
// tampoco tendría sentido, así que el contrato entre ambas listas se
// comprueba aquí, en tests/, que queda fuera de todos los elementos de
// eslint-plugin-boundaries.
describe('contrato de scopes', () => {
  it('lib/validation/tokens.ts y db/schema/tokens.ts declaran los mismos scopes', () => {
    expect([...validationScopes]).toEqual([...dbScopes])
  })
})
