import { describe, expect, it, vi } from 'vitest'

// Este archivo vive bajo lib/actions/** (proyecto vitest "db" por el patrón
// del glob), pero no toca Postgres ni sesión real: se sustituye
// requireHousehold por un espía que lanza si llega a invocarse, para probar
// que un id con formato inválido corta antes de tocar auth/servicio.
vi.mock('@/lib/auth/guards', () => ({
  requireHousehold: vi.fn(() => {
    throw new Error('no debería llamarse: el id inválido debe cortar antes')
  }),
}))

const { deleteRecipeAction, updateRecipeAction } = await import('./recipes')

describe('recipes actions — validación de id', () => {
  it('updateRecipeAction rechaza un id que no es uuid sin tocar el servicio', async () => {
    const result = await updateRecipeAction('no-es-un-uuid', { title: 'x' })
    expect(result).toEqual({ ok: false, code: 'validation', message: 'Id inválido' })
  })

  it('deleteRecipeAction rechaza un id que no es uuid sin tocar el servicio', async () => {
    const result = await deleteRecipeAction('no-es-un-uuid')
    expect(result).toEqual({ ok: false, code: 'validation', message: 'Id inválido' })
  })
})
