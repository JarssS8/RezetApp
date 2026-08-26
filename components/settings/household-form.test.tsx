import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { HouseholdForm, HouseholdSwitcher, type HouseholdOption, type SwitchHouseholdFn, type UpdateHouseholdFn } from './household-form'

afterEach(cleanup)

const initial = { id: 'h1', name: 'Casa de Ana', defaultServings: 2, expiryAlertDays: 3 }

describe('HouseholdForm', () => {
  it('pinta los valores iniciales', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ settings, common }}>
        <HouseholdForm initial={initial} isOwner updateAction={vi.fn<UpdateHouseholdFn>(async () => ({ ok: true, data: initial }))} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByLabelText('Nombre del hogar')).toHaveValue('Casa de Ana')
    expect(screen.getByLabelText('Raciones por defecto')).toHaveValue(2)
    expect(screen.getByLabelText('Avisar de caducidad con (días)')).toHaveValue(3)
  })

  it('un miembro (no propietario) ve los campos deshabilitados y sin botón guardar', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ settings, common }}>
        <HouseholdForm initial={initial} isOwner={false} updateAction={vi.fn<UpdateHouseholdFn>(async () => ({ ok: true, data: initial }))} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByLabelText('Nombre del hogar')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('guardar envía el parche y muestra "Guardado"', async () => {
    const updateAction = vi.fn<UpdateHouseholdFn>(async () => ({ ok: true, data: { id: 'h1', name: 'Casa nueva', defaultServings: 4, expiryAlertDays: 3 } }))
    render(
      <NextIntlClientProvider locale="es" messages={{ settings, common }}>
        <HouseholdForm initial={initial} isOwner updateAction={updateAction} />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), { target: { value: 'Casa nueva' } })
    fireEvent.change(screen.getByLabelText('Raciones por defecto'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateAction).toHaveBeenCalledWith({ name: 'Casa nueva', defaultServings: 4, expiryAlertDays: 3 }))
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
  })

  it('si falla el guardado muestra el error', async () => {
    const updateAction = vi.fn<UpdateHouseholdFn>(async () => ({ ok: false, code: 'forbidden', message: 'no' }))
    render(
      <NextIntlClientProvider locale="es" messages={{ settings, common }}>
        <HouseholdForm initial={initial} isOwner updateAction={updateAction} />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No se pudo completar la acción.')).toBeInTheDocument()
  })
})

const households: HouseholdOption[] = [
  { id: 'h1', name: 'Casa de Ana', role: 'owner' },
  { id: 'h2', name: 'Casa de Bo', role: 'member' },
]

describe('HouseholdSwitcher', () => {
  it('no pinta nada si solo hay un hogar', () => {
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={{ settings, common }}>
        <HouseholdSwitcher households={[households[0]!]} currentId="h1" switchAction={vi.fn<SwitchHouseholdFn>(async () => ({ ok: true, data: null }))} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('marca el hogar activo y deja cambiar a los demás', async () => {
    const switchAction = vi.fn<SwitchHouseholdFn>(async () => ({ ok: true, data: null }))
    render(
      <NextIntlClientProvider locale="es" messages={{ settings, common }}>
        <HouseholdSwitcher households={households} currentId="h1" switchAction={switchAction} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Actual')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de hogar' }))
    await waitFor(() => expect(switchAction).toHaveBeenCalledWith('h2'))
  })
})
