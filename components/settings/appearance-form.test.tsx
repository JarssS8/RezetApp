import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { AppearanceForm, type AppearancePrefs, type UpdatePrefsFn } from './appearance-form'

afterEach(cleanup)

const initial: AppearancePrefs = { displayName: 'Ana', theme: 'system', accent: 'huerta', locale: 'es', units: 'metric' }

function renderForm(updateAction?: UpdatePrefsFn) {
  const action = updateAction ?? vi.fn<UpdatePrefsFn>(async () => ({ ok: true, data: null }))
  render(
    <NextIntlClientProvider locale="es" messages={{ settings, common }}>
      <AppearanceForm initial={initial} updateAction={action} />
    </NextIntlClientProvider>,
  )
  return { action }
}

describe('AppearanceForm', () => {
  it('marca el tema y el acento actuales', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('radio', { name: 'Huerta' })).toHaveAttribute('aria-checked', 'true')
  })

  it('cambiar el tema guarda solo ese campo', async () => {
    const { action } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Noche suave' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ theme: 'dark' }))
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
  })

  it('click en «miel» guarda { accent: "miel" }', async () => {
    const { action } = renderForm()
    fireEvent.click(screen.getByRole('radio', { name: 'Miel' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ accent: 'miel' }))
    expect(screen.getByRole('radio', { name: 'Miel' })).toHaveAttribute('aria-checked', 'true')
  })

  it('cambiar unidades guarda solo ese campo', async () => {
    const { action } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Imperial' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ units: 'imperial' }))
  })

  it('cambiar idioma guarda solo ese campo', async () => {
    const { action } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Inglés' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ locale: 'en' }))
  })

  it('editar el nombre visible y guardar envía displayName', async () => {
    const { action } = renderForm()
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana María' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ displayName: 'Ana María' }))
  })

  it('muestra un error si la acción falla', async () => {
    const action = vi.fn<UpdatePrefsFn>(async () => ({ ok: false, code: 'internal', message: 'x' }))
    renderForm(action)
    fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
    expect(await screen.findByText('No se pudieron guardar los cambios.')).toBeInTheDocument()
  })
})
