import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import settings from '@/messages/es/settings.json'
import { ShoplistSettingsSchema } from '@/lib/validation/household'
import { ShoplistSettingsForm, type ShoplistSettingsFormProps } from './shoplist-settings-form'

const { updateShoplistSettingsAction } = vi.hoisted(() => ({ updateShoplistSettingsAction: vi.fn() }))
vi.mock('@/lib/actions/shopping', () => ({ updateShoplistSettingsAction }))

afterEach(() => {
  vi.clearAllMocks()
})

const BASE_PROPS: ShoplistSettingsFormProps = {
  fnUrl: null,
  hasSecret: false,
  listToken: null,
  source: 'none',
  lastPushed: null,
  deepLink: null,
  readOnly: false,
}

function renderForm(props: Partial<ShoplistSettingsFormProps> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ common, settings, errors }}>
      <ShoplistSettingsForm {...BASE_PROPS} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('ShoplistSettingsForm', () => {
  it('no muestra el interruptor de borrar secreto cuando no hay uno guardado', () => {
    renderForm()
    expect(screen.queryByRole('switch', { name: 'Borrar el secreto guardado' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Secreto')).not.toHaveAttribute('placeholder', '•••• (guardado)')
  })

  it('usa el placeholder de secreto guardado cuando hasSecret es true', () => {
    renderForm({ hasSecret: true })
    expect(screen.getByLabelText('Secreto')).toHaveAttribute('placeholder', '•••• (guardado)')
    expect(screen.getByRole('switch', { name: 'Borrar el secreto guardado' })).toBeInTheDocument()
  })

  it('Guardar llama a updateShoplistSettingsAction con un payload válido y secret vacío si no se tocó', async () => {
    updateShoplistSettingsAction.mockResolvedValueOnce({
      ok: true,
      data: { fnUrl: 'https://fn.example.com', listToken: 'tok', hasSecret: true, source: 'household', lastPushedAt: null },
    })
    renderForm({ fnUrl: 'https://fn.example.com', listToken: 'tok', hasSecret: true, source: 'household' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateShoplistSettingsAction).toHaveBeenCalledTimes(1))
    const payload = updateShoplistSettingsAction.mock.calls[0]?.[0]
    expect(ShoplistSettingsSchema.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ fnUrl: 'https://fn.example.com', listToken: 'tok', secret: '' })
  })

  it('el interruptor de borrar secreto envía secret: null', async () => {
    updateShoplistSettingsAction.mockResolvedValueOnce({
      ok: true,
      data: { fnUrl: null, listToken: null, hasSecret: false, source: 'none', lastPushedAt: null },
    })
    renderForm({ hasSecret: true })
    fireEvent.click(screen.getByRole('switch', { name: 'Borrar el secreto guardado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateShoplistSettingsAction).toHaveBeenCalledTimes(1))
    const payload = updateShoplistSettingsAction.mock.calls[0]?.[0]
    expect(ShoplistSettingsSchema.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ secret: null })
  })

  // Regla I3/14/24: `result.message` (ServiceError/zod en español crudo) no
  // se pinta tal cual; se traduce por `result.code`.
  it('Guardar traduce el error por código en vez de pintar result.message crudo', async () => {
    updateShoplistSettingsAction.mockResolvedValueOnce({ ok: false, code: 'validation', message: 'fnUrl inválida (texto crudo de zod)' })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Revisa los datos introducidos.')).toBeInTheDocument()
    expect(screen.queryByText(/texto crudo de zod/)).not.toBeInTheDocument()
  })

  it('en solo lectura muestra el aviso de propietario, la fuente y el enlace a ShopList', () => {
    renderForm({ readOnly: true, source: 'env', lastPushed: '26 ago 2026, 10:00', deepLink: 'https://shop.jarsss8.es/#/s/tok' })
    expect(screen.queryByTestId('shoplist-settings-form')).not.toBeInTheDocument()
    expect(screen.getByText('Solo el propietario puede cambiar los ajustes de ShopList.')).toBeInTheDocument()
    expect(screen.getByText('Configurado en el servidor')).toBeInTheDocument()
    expect(screen.getByText('Último envío: 26 ago 2026, 10:00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /abrir en shoplist/i })).toHaveAttribute('href', 'https://shop.jarsss8.es/#/s/tok')
  })
})
