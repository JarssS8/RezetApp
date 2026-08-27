import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import plan from '@/messages/es/plan.json'
import type { ShoppingLine } from '@/lib/domain'
import { ShoppingLineSchema } from '@/lib/validation/shopping'
import { ShoppingPushButton } from './shopping-push-button'

const { pushShoppingAction } = vi.hoisted(() => ({ pushShoppingAction: vi.fn() }))
vi.mock('@/lib/actions/shopping', () => ({ pushShoppingAction }))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

afterEach(() => {
  vi.clearAllMocks()
})

const LINES: ShoppingLine[] = [
  { foodId: '11111111-1111-4111-8111-111111111111', name: 'Tomate', quantity: 200, unit: 'g', unresolved: false, pantryUnmatched: false },
  { foodId: null, name: 'Especia rara', quantity: null, unit: null, unresolved: false, pantryUnmatched: false },
]

function renderButton(props: Partial<{ canPush: boolean; deepLink: string | null; lines: ShoppingLine[] }> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ plan }}>
      <ShoppingPushButton lines={props.lines ?? LINES} canPush={props.canPush ?? true} deepLink={props.deepLink ?? 'https://shop.jarsss8.es/#/s/tok'} />
    </NextIntlClientProvider>,
  )
}

describe('ShoppingPushButton', () => {
  it('no renderiza nada si no hay líneas, aunque haya config', () => {
    renderButton({ lines: [] })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/shopList/i)).not.toBeInTheDocument()
  })

  it('sin config muestra el aviso y no el botón de envío', () => {
    renderButton({ canPush: false })
    expect(screen.queryByRole('button', { name: /enviar a shoplist/i })).not.toBeInTheDocument()
    expect(screen.getByText('ShopList no está configurado. Actívalo en Ajustes → ShopList.')).toBeInTheDocument()
  })

  it('al pulsar envía exactamente las líneas mostradas, validadas por ShoppingLineSchema', async () => {
    pushShoppingAction.mockResolvedValueOnce({ ok: true, data: { inserted: 1, deepLink: 'https://shop.jarsss8.es/#/s/tok' } })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /enviar a shoplist/i }))
    await waitFor(() => expect(pushShoppingAction).toHaveBeenCalledTimes(1))
    const payload = pushShoppingAction.mock.calls[0]?.[0]
    expect(payload).toEqual(LINES)
    const parsed = ShoppingLineSchema.array().safeParse(payload)
    expect(parsed.success).toBe(true)
  })

  it('muestra el número insertado y el enlace que devuelve la propia acción de envío (no la prop inicial)', async () => {
    // deepLink distinto al de la prop: si el href viniera de la prop en vez
    // de la respuesta, esta aserción lo delataría.
    pushShoppingAction.mockResolvedValueOnce({ ok: true, data: { inserted: 3, deepLink: 'https://shop.jarsss8.es/#/s/tras-envio' } })
    renderButton({ deepLink: 'https://shop.jarsss8.es/#/s/inicial' })
    fireEvent.click(screen.getByRole('button', { name: /enviar a shoplist/i }))
    expect(await screen.findByText('Enviado a ShopList: 3 líneas')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /abrir en shoplist/i })
    expect(link).toHaveAttribute('href', 'https://shop.jarsss8.es/#/s/tras-envio')
  })

  it('en caso de fallo del envío muestra un toast de error y no un resultado', async () => {
    pushShoppingAction.mockResolvedValueOnce({ ok: false, code: 'shoplist', message: 'ShopList: 500 boom' })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /enviar a shoplist/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('ShopList: 500 boom'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
