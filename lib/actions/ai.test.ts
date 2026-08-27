import { describe, expect, it, vi } from 'vitest'

// Vive bajo lib/actions/** (proyecto vitest "db" por el glob) pero no toca Postgres:
// requireHousehold y el servicio de IA se sustituyen por espías, así se comprueba
// que una imagen demasiado grande nunca llega al servicio de IA (ítem 9 de la
// revisión final: lib/actions/ai.ts::aiImportRecipeAction).
vi.mock('@/lib/auth/guards', () => ({
  requireHousehold: vi.fn(),
}))

vi.mock('@/lib/services/ai-tasks', () => ({
  aiImportRecipe: vi.fn(),
}))

const { aiImportRecipeAction } = await import('./ai')
const { requireHousehold } = await import('@/lib/auth/guards')
const { aiImportRecipe } = await import('@/lib/services/ai-tasks')
const { MAX_UPLOAD_BYTES } = await import('@/lib/uploads/store')

describe('aiImportRecipeAction — tope de tamaño de imagen', () => {
  it('rechaza una imagen mayor que MAX_UPLOAD_BYTES sin llamar al servicio de IA', async () => {
    vi.mocked(requireHousehold).mockResolvedValueOnce({ householdId: 'h1' } as Awaited<ReturnType<typeof requireHousehold>>)
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    const result = await aiImportRecipeAction({ kind: 'image', bytes, mime: 'image/jpeg' })
    expect(result).toEqual({ ok: false, code: 'validation', message: 'Imagen demasiado grande' })
    expect(aiImportRecipe).not.toHaveBeenCalled()
  })

  it('acepta una imagen dentro del tope y llega al servicio de IA', async () => {
    vi.mocked(requireHousehold).mockResolvedValueOnce({ householdId: 'h1' } as Awaited<ReturnType<typeof requireHousehold>>)
    vi.mocked(aiImportRecipe).mockResolvedValueOnce({ ok: false, code: 'no_provider', message: 'sin proveedor' })
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES)
    const result = await aiImportRecipeAction({ kind: 'image', bytes, mime: 'image/jpeg' })
    expect(aiImportRecipe).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: false, code: 'no_provider', message: 'sin proveedor' })
  })
})
