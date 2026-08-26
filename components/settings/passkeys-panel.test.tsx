import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { PasskeysPanel, type PasskeyRow, type RemovePasskeyFn, type RenamePasskeyFn } from './passkeys-panel'

afterEach(cleanup)

const rowA: PasskeyRow = {
  credentialId: 'cred-a',
  name: 'Portátil',
  deviceType: 'singleDevice',
  backedUp: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  lastUsedAt: '2026-08-20T10:00:00.000Z',
}
const rowB: PasskeyRow = { credentialId: 'cred-b', name: null, deviceType: 'multiDevice', backedUp: true, createdAt: '2026-08-05T00:00:00.000Z', lastUsedAt: null }

function renderPanel(passkeys: PasskeyRow[], overrides: Partial<{ renameAction: RenamePasskeyFn; removeAction: RemovePasskeyFn }> = {}) {
  const renameAction = overrides.renameAction ?? vi.fn<RenamePasskeyFn>(async () => ({ ok: true, data: null }))
  const removeAction = overrides.removeAction ?? vi.fn<RemovePasskeyFn>(async () => ({ ok: true, data: null }))
  render(
    <NextIntlClientProvider locale="es" messages={{ settings, common }}>
      <PasskeysPanel passkeys={passkeys} renameAction={renameAction} removeAction={removeAction} />
    </NextIntlClientProvider>,
  )
  return { renameAction, removeAction }
}

describe('PasskeysPanel', () => {
  it('lista las passkeys con nombre, «Sin nombre» de respaldo y la insignia de sincronizada/solo este dispositivo', () => {
    renderPanel([rowA, rowB])
    expect(screen.getByText('Portátil')).toBeInTheDocument()
    expect(screen.getByText('Sin nombre')).toBeInTheDocument()
    expect(screen.getByText('Solo este dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Sincronizada')).toBeInTheDocument()
    expect(screen.getByText('Nunca')).toBeInTheDocument()
  })

  it('renombrar entra en modo edición y llama a la acción con el nombre recortado', async () => {
    const { renameAction } = renderPanel([rowA, rowB])
    fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar' })[0]!)
    const input = screen.getByLabelText('Nombre del dispositivo')
    fireEvent.change(input, { target: { value: '  Móvil  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(renameAction).toHaveBeenCalledWith('cred-a', 'Móvil'))
  })

  it('eliminar pide confirmación antes de llamar a la acción', async () => {
    const { removeAction } = renderPanel([rowA, rowB])
    const removeButtons = screen.getAllByRole('button', { name: 'Eliminar' })
    fireEvent.click(removeButtons[0]!)
    expect(screen.getByText('¿Eliminar esta passkey? Tendrás que volver a registrarla si quieres usarla otra vez.')).toBeInTheDocument()
    expect(removeAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' }).at(-1)!)
    await waitFor(() => expect(removeAction).toHaveBeenCalledWith('cred-a'))
  })

  it('con una sola passkey, el botón de eliminar está deshabilitado y se muestra el aviso', () => {
    renderPanel([rowA])
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled()
    expect(screen.getByText('No puedes eliminar tu única passkey.')).toBeInTheDocument()
  })
})
