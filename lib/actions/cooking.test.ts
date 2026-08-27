import { describe, expect, it, vi } from 'vitest'
import { LogCookedSchema } from '@/lib/validation/cooking'
import { logCookedAction } from './cooking'

// requireHousehold redirige a /login sin sesión: en logCookedAction la
// validación corre ANTES del guard (al revés que el resto de acciones, ver
// nota en lib/actions/cooking.ts), así que aquí solo hace falta simular el
// guard para que no intente resolver sesión real. El test no toca Postgres (el
// mock lanza si algo llegara a invocarlo), así que no hace falta db/test/setup:
// lib/actions no puede importar de db (frontera de eslint-boundaries), y aquí
// tampoco aportaría nada hacerlo.
vi.mock('@/lib/auth/guards', () => ({ requireHousehold: vi.fn(async () => { throw new Error('sin sesión') }) }))

describe('logCookedAction', () => {
  it('rechaza una carga que el esquema real no acepta', async () => {
    // Regla W2-R11: el mismo objeto se valida contra el esquema real, no solo
    // contra el mock, para que un cambio de nombre de campo se note aquí.
    expect(LogCookedSchema.safeParse({ servingsCooked: 2 }).success).toBe(false)
    const result = await logCookedAction({ servingsCooked: 2 })
    expect(result).toMatchObject({ ok: false, code: 'validation' })
  })
  it('acepta la forma que sí describe el esquema', () => {
    const uuid = '11111111-1111-4111-8111-111111111111'
    expect(LogCookedSchema.safeParse({ entryId: uuid, servingsCooked: 4, leftovers: { servings: 2, date: '2026-08-28', slot: 'lunch' } }).success).toBe(true)
    expect(LogCookedSchema.safeParse({ recipeId: uuid, servingsCooked: 2, slot: 'dinner' }).success).toBe(true)
  })
})
