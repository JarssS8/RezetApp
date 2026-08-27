import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '@/messages/es/cook.json'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import { LogCookedSchema } from '@/lib/validation/cooking'
import { FinishCookingDialog } from './finish-dialog'

const logCookedAction = vi.hoisted(() => vi.fn())
vi.mock('@/lib/actions/cooking', () => ({ logCookedAction }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

// Sin esto, `mock.calls[0]` de un test vería la llamada del anterior: los
// tres tests comparten el mismo `logCookedAction` (patrón del resto de
// diálogos, p. ej. components/plan/add-entry-sheet.test.tsx).
afterEach(() => {
  vi.clearAllMocks()
})

const entryId = '11111111-1111-4111-8111-111111111111'
const recipeId = '22222222-2222-4222-8222-222222222222'

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="es" messages={{ cook: messages, common, errors }}>
      <FinishCookingDialog recipeId={recipeId} entryId={entryId} servings={4} sourceSlot="dinner" />
    </NextIntlClientProvider>,
  )
}

describe('FinishCookingDialog', () => {
  it('envía las raciones cocinadas y, si se pide, las sobras — con la forma que exige el esquema real', async () => {
    const user = userEvent.setup()
    logCookedAction.mockResolvedValue({ ok: true, data: { logId: 'l1', entryId, recipeId, servingsCooked: 4, kcalPerServing: 300, deductions: [], warnings: [], leftoverEntryId: null } })
    renderDialog()
    await user.click(screen.getByRole('button', { name: /he terminado/i }))
    await user.click(screen.getByRole('checkbox', { name: /sobras/i }))
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))

    const payload = logCookedAction.mock.calls[0]?.[0]
    // Regla W2-R11: la carga se valida contra el esquema real, no solo contra el mock.
    expect(LogCookedSchema.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ entryId, servingsCooked: 4, leftovers: { servings: 1, slot: 'dinner' } })
  })

  it('sin sobras no manda la clave leftovers (exactOptionalPropertyTypes)', async () => {
    const user = userEvent.setup()
    logCookedAction.mockResolvedValue({ ok: true, data: { logId: 'l1', entryId, recipeId, servingsCooked: 4, kcalPerServing: null, deductions: [], warnings: [], leftoverEntryId: null } })
    renderDialog()
    await user.click(screen.getByRole('button', { name: /he terminado/i }))
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))
    const payload = logCookedAction.mock.calls[0]?.[0] as Record<string, unknown>
    expect('leftovers' in payload).toBe(false)
    expect(LogCookedSchema.safeParse(payload).success).toBe(true)
  })

  it('enseña los avisos de despensa que devuelve el servidor', async () => {
    const user = userEvent.setup()
    logCookedAction.mockResolvedValue({
      ok: true,
      data: { logId: 'l1', entryId, recipeId, servingsCooked: 4, kcalPerServing: null, deductions: [], leftoverEntryId: null, warnings: [{ foodId: 'f1', name: 'cebolla', requested: 300, deducted: 100, unit: 'g' }] },
    })
    renderDialog()
    await user.click(screen.getByRole('button', { name: /he terminado/i }))
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(await screen.findByText(/cebolla/)).toBeInTheDocument()
  })
})
