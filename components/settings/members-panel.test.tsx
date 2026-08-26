import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { MembersPanel, type CreateInviteFn, type MemberRow, type RemoveMemberFn, type UpdateMemberFn } from './members-panel'

afterEach(cleanup)

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } })
})

const owner: MemberRow = { userId: 'u-ana', displayName: 'Ana', role: 'owner', allergens: [], dietaryFlags: [] }
const member: MemberRow = { userId: 'u-bo', displayName: 'Bo', role: 'member', allergens: ['gluten'], dietaryFlags: ['vegano'] }

function renderPanel(
  members: MemberRow[],
  overrides: Partial<{ currentUserId: string; isOwner: boolean; updateAction: UpdateMemberFn; removeAction: RemoveMemberFn; createInviteAction: CreateInviteFn }> = {},
) {
  const updateAction = overrides.updateAction ?? vi.fn<UpdateMemberFn>(async () => ({ ok: true, data: null }))
  const removeAction = overrides.removeAction ?? vi.fn<RemoveMemberFn>(async () => ({ ok: true, data: null }))
  const createInviteAction =
    overrides.createInviteAction ?? vi.fn<CreateInviteFn>(async () => ({ ok: true, data: { token: 'tok123', url: 'http://localhost:3000/invite/tok123', expiresAt: '2026-08-27T00:00:00.000Z' } }))
  render(
    <NextIntlClientProvider locale="es" messages={{ settings, common }}>
      <MembersPanel
        members={members}
        currentUserId={overrides.currentUserId ?? owner.userId}
        isOwner={overrides.isOwner ?? true}
        updateAction={updateAction}
        removeAction={removeAction}
        createInviteAction={createInviteAction}
      />
    </NextIntlClientProvider>,
  )
  return { updateAction, removeAction, createInviteAction }
}

// Cada miembro tiene su propia tarjeta con los mismos chips de alérgenos:
// las consultas de un miembro concreto se acotan a su tarjeta con `within`.
function cardFor(name: string) {
  const heading = screen.getByText(name)
  const card = heading.closest('[data-slot="card"]')
  if (!card) throw new Error(`No se encontró la tarjeta de ${name}`)
  return within(card as HTMLElement)
}

describe('MembersPanel', () => {
  it('lista a los miembros con su rol y marca al usuario actual', () => {
    renderPanel([owner, member])
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bo')).toBeInTheDocument()
    expect(screen.getByText('tú')).toBeInTheDocument()
    expect(screen.getByText('Propietario')).toBeInTheDocument()
    expect(screen.getByText('Miembro')).toBeInTheDocument()
  })

  it('solo el propietario ve el botón de invitar', () => {
    renderPanel([owner], { isOwner: false })
    expect(screen.queryByRole('button', { name: 'Invitar' })).not.toBeInTheDocument()
  })

  it('invitar crea el enlace y lo muestra con opción de copiar y el aviso de caducidad', async () => {
    const { createInviteAction } = renderPanel([owner])
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }))
    await waitFor(() => expect(createInviteAction).toHaveBeenCalled())
    expect(await screen.findByText('http://localhost:3000/invite/tok123')).toBeInTheDocument()
    expect(screen.getByText('Enlace de invitación (caduca en 24 h)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/invite/tok123'))
    expect(await screen.findByText('Copiado')).toBeInTheDocument()
  })

  it('marca los alérgenos ya guardados del miembro', () => {
    renderPanel([owner, member])
    const bo = cardFor('Bo')
    expect(bo.getByRole('button', { name: 'Gluten' })).toHaveAttribute('aria-pressed', 'true')
    expect(bo.getByRole('button', { name: 'Lactosa' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('pulsar un chip de alérgeno envía la lista completa actualizada', async () => {
    const { updateAction } = renderPanel([owner, member])
    fireEvent.click(cardFor('Bo').getByRole('button', { name: 'Lactosa' }))
    await waitFor(() => expect(updateAction).toHaveBeenCalledWith({ userId: 'u-bo', allergens: ['gluten', 'lactose'] }))
  })

  it('quitar un alérgeno ya marcado envía la lista sin él', async () => {
    const { updateAction } = renderPanel([owner, member])
    fireEvent.click(cardFor('Bo').getByRole('button', { name: 'Gluten' }))
    await waitFor(() => expect(updateAction).toHaveBeenCalledWith({ userId: 'u-bo', allergens: [] }))
  })

  it('un miembro no puede tocar los alérgenos de otro miembro', () => {
    renderPanel([owner, member], { currentUserId: member.userId, isOwner: false })
    // La tarjeta de Ana (propietaria) queda deshabilitada para Bo
    expect(cardFor('Ana').getByRole('button', { name: 'Gluten' })).toBeDisabled()
  })

  it('escribir una preferencia y pulsar Enter la añade como chip', async () => {
    const { updateAction } = renderPanel([member], { currentUserId: member.userId, isOwner: false })
    const input = screen.getByPlaceholderText('Escribe y pulsa Enter')
    fireEvent.change(input, { target: { value: 'sin gluten' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateAction).toHaveBeenCalledWith({ userId: 'u-bo', dietaryFlags: ['vegano', 'sin gluten'] }))
  })

  it('expulsar pide confirmación antes de llamar a la acción', async () => {
    const { removeAction } = renderPanel([owner, member])
    fireEvent.click(screen.getByRole('button', { name: 'Expulsar' }))
    expect(screen.getByText('¿Expulsar a Bo del hogar?')).toBeInTheDocument()
    expect(removeAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Expulsar' })[1] ?? screen.getByRole('button', { name: 'Expulsar' }))
    await waitFor(() => expect(removeAction).toHaveBeenCalledWith('u-bo'))
  })

  it('no se puede expulsar a uno mismo ni un miembro puede expulsar a nadie', () => {
    renderPanel([owner, member])
    expect(screen.queryAllByRole('button', { name: 'Expulsar' })).toHaveLength(1) // solo la tarjeta de Bo, no la de Ana (self)

    cleanup()
    renderPanel([owner, member], { currentUserId: member.userId, isOwner: false })
    expect(screen.queryByRole('button', { name: 'Expulsar' })).not.toBeInTheDocument()
  })
})
