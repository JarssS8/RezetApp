import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '@/messages/es/settings.json'
import { PushSubscriptionSchema } from '@/lib/validation/push'
import { NotificationsPanel, type NotificationsPanelProps } from './notifications-panel'

// Longitud realista de una clave pública VAPID (65 bytes en base64url, sin
// relleno): 87 caracteres. Una longitud arbitraria puede no decodificar con
// atob (el resto es válido solo si módulo 4 no da 1).
const PUBLIC_KEY = 'BABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKLMNOPQRSTUV'
const FAKE_ENDPOINT = 'https://push.example.com/abc'
const FAKE_KEYS = { p256dh: 'BPk_abc-DEF123ghiJKL456', auth: 'auth-XYZ_789' }

function Wrapped(props: NotificationsPanelProps) {
  return (
    <NextIntlClientProvider locale="es" messages={{ settings: messages }}>
      <NotificationsPanel {...props} />
    </NextIntlClientProvider>
  )
}

// Instala navegador, PushManager y Notification falsos. Se limpia en
// afterEach para no filtrar entre tests (el primer test depende de que no
// exista ninguno de los tres).
function installFakePush({ permission }: { permission: NotificationPermission }) {
  const subscription = {
    endpoint: FAKE_ENDPOINT,
    toJSON: () => ({ endpoint: FAKE_ENDPOINT, keys: FAKE_KEYS }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
  const registration = {
    pushManager: {
      subscribe: vi.fn().mockResolvedValue(subscription),
      getSubscription: vi.fn().mockResolvedValue(null),
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission,
    // Un navegador que ya deniega no vuelve a preguntar: resuelve 'denied' sin
    // diálogo. Si el estado inicial es 'default', se simula que la persona concede.
    requestPermission: vi.fn().mockResolvedValue(permission === 'denied' ? 'denied' : 'granted'),
  })
  return { registration, subscription }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('/api/push/public-key')) {
      return new Response(JSON.stringify({ publicKey: PUBLIC_KEY }), { status: 200 })
    }
    return new Response(null, { status: 204 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.restoreAllMocks()
})

describe('NotificationsPanel', () => {
  it('sin soporte del navegador lo explica y no ofrece el botón', () => {
    render(<Wrapped subscribedEndpoints={[]} />)
    expect(screen.getByText(messages.notifications.unsupported)).toBeVisible()
    expect(screen.queryByRole('button', { name: messages.notifications.enable })).toBeNull()
  })

  it('activar pide permiso, se suscribe y avisa al servidor', async () => {
    installFakePush({ permission: 'default' })
    const user = userEvent.setup()
    render(<Wrapped subscribedEndpoints={[]} />)
    await user.click(screen.getByRole('button', { name: messages.notifications.enable }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' })))
    const body = JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body as string)
    expect(PushSubscriptionSchema.safeParse(body).success).toBe(true)
  })

  it('con el permiso denegado lo dice en vez de reintentar', async () => {
    installFakePush({ permission: 'denied' })
    render(<Wrapped subscribedEndpoints={[]} />)
    expect(screen.getByText(messages.notifications.denied)).toBeVisible()
  })
})
