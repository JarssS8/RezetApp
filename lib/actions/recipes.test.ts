import { describe, expect, it, vi } from 'vitest'

// Este archivo vive bajo lib/actions/** (proyecto vitest "db" por el patrón
// del glob), pero no toca Postgres ni sesión real: requireHousehold se
// sustituye por un espía. Por defecto lanza (para probar que un id con
// formato inválido corta antes de llegar a auth/servicio); los tests de
// uploadImageAction lo resuelven una vez con un contexto mínimo, ya que esa
// acción sí necesita household.id antes de sus propias validaciones.
vi.mock('@/lib/auth/guards', () => ({
  requireHousehold: vi.fn(() => {
    throw new Error('no debería llamarse: el id inválido debe cortar antes')
  }),
}))

vi.mock('@/lib/uploads/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/uploads/store')>('@/lib/uploads/store')
  return { ...actual, saveImage: vi.fn() }
})

const { deleteRecipeAction, updateRecipeAction, uploadImageAction } = await import('./recipes')
const { requireHousehold } = await import('@/lib/auth/guards')
const { saveImage } = await import('@/lib/uploads/store')

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

describe('uploadImageAction — allowlist de mime types', () => {
  const fakeCtx = { householdId: 'h1' } as Awaited<ReturnType<typeof requireHousehold>>

  it('rechaza un tipo no permitido (image/gif) sin llamar a saveImage', async () => {
    vi.mocked(requireHousehold).mockResolvedValueOnce(fakeCtx)
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'a.gif', { type: 'image/gif' }))
    const result = await uploadImageAction(form)
    expect(result).toEqual({ ok: false, code: 'validation', message: 'No es una imagen válida' })
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('acepta un tipo permitido (image/webp) y llama a saveImage', async () => {
    vi.mocked(requireHousehold).mockResolvedValueOnce(fakeCtx)
    vi.mocked(saveImage).mockResolvedValueOnce({ path: '/x', url: '/api/uploads/h1/a.webp' })
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'a.webp', { type: 'image/webp' }))
    const result = await uploadImageAction(form)
    expect(result).toEqual({ ok: true, data: { url: '/api/uploads/h1/a.webp' } })
    expect(saveImage).toHaveBeenCalledWith('h1', expect.any(Uint8Array))
  })
})
