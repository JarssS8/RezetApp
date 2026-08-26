import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { DangerZone, type DeleteHouseholdFn, type LeaveHouseholdFn } from './danger-zone'

afterEach(cleanup)

function renderZone(overrides: Partial<{ isOwner: boolean; canLeave: boolean; leaveAction: LeaveHouseholdFn; deleteAction: DeleteHouseholdFn }> = {}) {
  const leaveAction = overrides.leaveAction ?? vi.fn<LeaveHouseholdFn>(async () => ({ ok: true, data: null }))
  const deleteAction = overrides.deleteAction ?? vi.fn<DeleteHouseholdFn>(async () => ({ ok: true, data: null }))
  render(
    <NextIntlClientProvider locale="es" messages={{ settings, common }}>
      <DangerZone householdName="Casa de Ana" isOwner={overrides.isOwner ?? true} canLeave={overrides.canLeave ?? true} leaveAction={leaveAction} deleteAction={deleteAction} />
    </NextIntlClientProvider>,
  )
  return { leaveAction, deleteAction }
}

describe('DangerZone', () => {
  it('un miembro (no propietario) ve "Salir del hogar" pero no "Borrar hogar"', () => {
    renderZone({ isOwner: false, canLeave: true })
    expect(screen.getByRole('button', { name: 'Salir del hogar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar hogar' })).not.toBeInTheDocument()
  })

  it('el propietario sin otro propietario no ve "Salir del hogar"', () => {
    renderZone({ isOwner: true, canLeave: false })
    expect(screen.queryByRole('button', { name: 'Salir del hogar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrar hogar' })).toBeInTheDocument()
  })

  it('el propietario con otro propietario ve ambos botones', () => {
    renderZone({ isOwner: true, canLeave: true })
    expect(screen.getByRole('button', { name: 'Salir del hogar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrar hogar' })).toBeInTheDocument()
  })

  it('salir pide confirmación en un diálogo antes de llamar a la acción', async () => {
    const { leaveAction } = renderZone({ isOwner: false })
    fireEvent.click(screen.getByRole('button', { name: 'Salir del hogar' }))
    expect(screen.getByText('Perderás el acceso a las recetas y al plan de este hogar.')).toBeInTheDocument()
    expect(leaveAction).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Salir del hogar' })[0]!)
    await waitFor(() => expect(leaveAction).toHaveBeenCalled())
  })

  it('si salir falla (último propietario, carrera) muestra el mensaje de error', async () => {
    const leaveAction = vi.fn<LeaveHouseholdFn>(async () => ({ ok: false, code: 'conflict', message: 'El último propietario no puede salir' }))
    renderZone({ isOwner: false, leaveAction })
    fireEvent.click(screen.getByRole('button', { name: 'Salir del hogar' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Salir del hogar' })[0]!)
    expect(await screen.findByText('No se pudo completar la acción.')).toBeInTheDocument()
  })

  it('el botón de borrar está deshabilitado hasta que el nombre coincide exactamente', async () => {
    renderZone({ isOwner: true })
    fireEvent.click(screen.getByRole('button', { name: 'Borrar hogar' }))
    const dialog = screen.getByRole('dialog')
    const confirmButton = within(dialog).getAllByRole('button', { name: 'Borrar hogar' })[0]!
    const input = within(dialog).getByLabelText('Nombre del hogar')
    expect(confirmButton).toBeDisabled()

    fireEvent.change(input, { target: { value: 'Casa de An' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(input, { target: { value: 'Casa de Ana' } })
    expect(confirmButton).not.toBeDisabled()
  })

  it('borrar con el nombre correcto llama a la acción con el texto escrito', async () => {
    const { deleteAction } = renderZone({ isOwner: true })
    fireEvent.click(screen.getByRole('button', { name: 'Borrar hogar' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nombre del hogar'), { target: { value: 'Casa de Ana' } })
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Borrar hogar' })[0]!)
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith('Casa de Ana'))
  })
})
