import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { ApiTokensPanel, type ApiTokenRow, type CreateApiTokenFn, type RevokeApiTokenFn } from './api-tokens-panel'

afterEach(cleanup)

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } })
})

function renderPanel(tokens: ApiTokenRow[], overrides: Partial<{ isOwner: boolean; createAction: CreateApiTokenFn; revokeAction: RevokeApiTokenFn }> = {}) {
  const createAction = overrides.createAction ?? vi.fn<CreateApiTokenFn>(async () => ({ ok: true, data: { id: 't1', token: 'rz_abc123' } }))
  const revokeAction = overrides.revokeAction ?? vi.fn<RevokeApiTokenFn>(async () => ({ ok: true, data: null }))
  render(
    <NextIntlClientProvider locale="es" messages={{ settings, common }}>
      <ApiTokensPanel tokens={tokens} isOwner={overrides.isOwner ?? true} createAction={createAction} revokeAction={revokeAction} />
    </NextIntlClientProvider>,
  )
  return { createAction, revokeAction }
}

describe('ApiTokensPanel', () => {
  it('muestra el mensaje vacío cuando no hay tokens', () => {
    renderPanel([])
    expect(screen.getByText('Sin tokens. Crea uno para conectar un asistente o un script.')).toBeInTheDocument()
  })

  it('lista los tokens con los scopes como chips, el perfil y el estado', () => {
    renderPanel([
      { id: 't1', name: 'MCP escritorio', scopes: ['recipes:read', 'plan:write'], mcpProfile: 'full', createdAt: '2026-08-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null },
      { id: 't2', name: 'Script viejo', scopes: [], mcpProfile: 'basic', createdAt: '2026-08-01T00:00:00.000Z', lastUsedAt: null, revokedAt: '2026-08-10T00:00:00.000Z' },
    ])
    expect(screen.getByText('MCP escritorio')).toBeInTheDocument()
    expect(screen.getByText('Leer recetas')).toBeInTheDocument()
    expect(screen.getByText('Editar el plan')).toBeInTheDocument()
    expect(screen.getByText('Completo (añade editar y borrar: recetas, entradas del plan, artículos de despensa y alimentos)')).toBeInTheDocument()
    expect(screen.getAllByText('Nunca')).toHaveLength(2)
    expect(screen.getByText('Revocado')).toBeInTheDocument()
  })

  it('crear un token lo muestra en un bloque code con botón de copiar y el aviso de que no se repite', async () => {
    const { createAction } = renderPanel([])
    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mi asistente' } })
    fireEvent.click(screen.getByLabelText('Leer recetas'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Crear token' })[1] ?? screen.getByRole('button', { name: 'Crear token' }))

    await waitFor(() => expect(createAction).toHaveBeenCalledWith({ name: 'Mi asistente', scopes: ['recipes:read'], mcpProfile: 'basic' }))
    expect(await screen.findByText('rz_abc123')).toBeInTheDocument()
    expect(screen.getByText('Token creado. Cópialo ahora: no se volverá a mostrar.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('rz_abc123'))
    expect(await screen.findByText('Copiado')).toBeInTheDocument()
  })

  it('revocar pide confirmación antes de llamar a la acción', async () => {
    const { revokeAction } = renderPanel([{ id: 't1', name: 'MCP', scopes: [], mcpProfile: 'basic', createdAt: '2026-08-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null }])
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }))
    expect(screen.getByText('¿Revocar este token? Dejará de funcionar de inmediato.')).toBeInTheDocument()
    expect(revokeAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Revocar' })[1] ?? screen.getByRole('button', { name: 'Revocar' }))
    await waitFor(() => expect(revokeAction).toHaveBeenCalledWith('t1'))
  })
})
