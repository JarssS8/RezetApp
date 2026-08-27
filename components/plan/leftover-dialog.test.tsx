import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import plan from '@/messages/es/plan.json'
import recipes from '@/messages/es/recipes.json'
import { CreateLeftoverInputSchema } from '@/lib/validation/plan'
import { LeftoverDialog } from './leftover-dialog'
import type { LeftoverDialogProps } from './leftover-dialog'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const createLeftoverAction = vi.fn()
vi.mock('@/lib/actions/plan', () => ({ createLeftoverAction: (...args: unknown[]) => createLeftoverAction(...args) }))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderDialog(props: Partial<LeftoverDialogProps> = {}) {
  const defaults: LeftoverDialogProps = { fromEntryId: 'e1', sourceSlot: 'lunch' }
  render(
    <NextIntlClientProvider locale="es" messages={{ plan, common, recipes }}>
      <LeftoverDialog {...defaults} {...props} />
    </NextIntlClientProvider>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Crear sobra' }))
}

// El "hoy" del reloj del sistema durante los tests: fija la fecha por
// defecto de la sobra (mañana) para que las aserciones no dependan del día
// real de ejecución.
describe('LeftoverDialog', () => {
  beforeEach(() => {
    // Solo se falsea Date (no setTimeout/setInterval): waitFor usa temporizadores
    // reales para sondear, y si también se falsean se queda colgado sin avanzarlos.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-26T10:00:00Z'))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('abre con la fecha de mañana y el hueco de origen por defecto, 1 ración', () => {
    renderDialog({ sourceSlot: 'dinner' })
    openDialog()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-08-27')
    expect(screen.getByLabelText('Hueco')).toHaveValue('dinner')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('llama a createLeftoverAction con ofEntryId (no fromEntryId) y el payload es válido según el esquema real', async () => {
    const fromEntryId = '11111111-1111-4111-8111-111111111111'
    createLeftoverAction.mockResolvedValue({ ok: true, data: {} })
    renderDialog({ fromEntryId, sourceSlot: 'breakfast' })
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createLeftoverAction).toHaveBeenCalled())
    const payload = createLeftoverAction.mock.calls[0]?.[0]
    expect(payload).toStrictEqual({ ofEntryId: fromEntryId, date: '2026-08-27', slot: 'breakfast', servings: 1 })
    // Regresión: el diálogo llegó a enviar `fromEntryId`, que CreateLeftoverInputSchema
    // (z.strictObject) rechaza al no reconocer la clave; se valida contra el esquema
    // real de lib/actions/plan.ts para que un futuro desajuste de claves falle aquí.
    expect(CreateLeftoverInputSchema.safeParse(payload).success).toBe(true)
    expect(refresh).toHaveBeenCalled()
  })

  it('cambia las raciones con el stepper (botones +/- de ServingsStepper) antes de enviar', async () => {
    createLeftoverAction.mockResolvedValue({ ok: true, data: {} })
    renderDialog({ fromEntryId: 'e7', sourceSlot: 'snack' })
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Más raciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createLeftoverAction).toHaveBeenCalledWith({ ofEntryId: 'e7', date: '2026-08-27', slot: 'snack', servings: 2 }))
  })

  it('el botón de disminuir raciones no baja de 1', () => {
    renderDialog({ fromEntryId: 'e8', sourceSlot: 'lunch' })
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Menos raciones' }))
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('muestra un error y no cierra el diálogo si la acción falla', async () => {
    createLeftoverAction.mockResolvedValue({ ok: false, code: 'validation' })
    renderDialog({ fromEntryId: 'e9', sourceSlot: 'lunch' })
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createLeftoverAction).toHaveBeenCalled())
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
  })

  it('reinicia fecha, hueco y raciones a los valores por defecto cada vez que se abre', () => {
    renderDialog({ sourceSlot: 'dinner' })
    openDialog()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hueco'), { target: { value: 'lunch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Más raciones' }))
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-01')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    openDialog()

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-08-27')
    expect(screen.getByLabelText('Hueco')).toHaveValue('dinner')
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
