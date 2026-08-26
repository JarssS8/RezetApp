import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import plan from '@/messages/es/plan.json'
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
    <NextIntlClientProvider locale="es" messages={{ plan, common }}>
      <LeftoverDialog {...defaults} {...props} />
    </NextIntlClientProvider>,
  )
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
    fireEvent.click(screen.getByRole('button', { name: 'Crear sobra' }))
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-08-27')
    expect(screen.getByLabelText('Hueco')).toHaveValue('dinner')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('llama a createLeftoverAction con el payload del formulario al enviar', async () => {
    createLeftoverAction.mockResolvedValue({ ok: true, data: {} })
    renderDialog({ fromEntryId: 'e42', sourceSlot: 'breakfast' })
    fireEvent.click(screen.getByRole('button', { name: 'Crear sobra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(createLeftoverAction).toHaveBeenCalledWith({ fromEntryId: 'e42', date: '2026-08-27', slot: 'breakfast', servings: 1 }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('cambia las raciones con el stepper antes de enviar', async () => {
    createLeftoverAction.mockResolvedValue({ ok: true, data: {} })
    renderDialog({ fromEntryId: 'e7', sourceSlot: 'snack' })
    fireEvent.click(screen.getByRole('button', { name: 'Crear sobra' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Raciones' })[1] as HTMLElement) // +
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createLeftoverAction).toHaveBeenCalledWith({ fromEntryId: 'e7', date: '2026-08-27', slot: 'snack', servings: 2 }))
  })

  it('muestra un error y no cierra el diálogo si la acción falla', async () => {
    createLeftoverAction.mockResolvedValue({ ok: false, code: 'validation' })
    renderDialog({ fromEntryId: 'e9', sourceSlot: 'lunch' })
    fireEvent.click(screen.getByRole('button', { name: 'Crear sobra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createLeftoverAction).toHaveBeenCalled())
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
  })
})
