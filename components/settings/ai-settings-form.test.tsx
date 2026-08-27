import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import settings from '@/messages/es/settings.json'
import { AiSettingsSchema } from '@/lib/validation/household'
import { AiSettingsForm, type AiSettingsFormProps, type KnownAiModel } from './ai-settings-form'

const { testAiConnectionAction, updateAiSettingsAction } = vi.hoisted(() => ({
  testAiConnectionAction: vi.fn(),
  updateAiSettingsAction: vi.fn(),
}))

vi.mock('@/lib/actions/ai', () => ({ testAiConnectionAction, updateAiSettingsAction }))

const KNOWN_MODELS: KnownAiModel[] = [
  { provider: 'openai', id: 'gpt-4o-mini' },
  { provider: 'openai_compatible', id: 'qwen3-8b' },
]

const BASE_PROPS: AiSettingsFormProps = {
  provider: 'none',
  model: null,
  baseUrl: null,
  hasKey: false,
  monthlyCapCents: 500,
  structuredOutput: false,
  spentThisMonthCents: 320,
  knownModels: KNOWN_MODELS,
  readOnly: false,
}

afterEach(() => {
  vi.clearAllMocks()
})

function renderForm(props: Partial<AiSettingsFormProps> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ common, settings, errors }}>
      <AiSettingsForm {...BASE_PROPS} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('AiSettingsForm', () => {
  it('muestra el tope en euros y el gasto del mes', () => {
    renderForm({ monthlyCapCents: 1250, spentThisMonthCents: 340 })
    expect(screen.getByLabelText('Tope mensual (€)')).toHaveValue(12.5)
    expect(screen.getByText(/Gastado este mes: 3,40 €/)).toBeInTheDocument()
  })

  it('no muestra la URL del servidor local salvo que el proveedor sea openai_compatible', () => {
    renderForm({ provider: 'anthropic' })
    expect(screen.queryByLabelText('URL del servidor local')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox'))
    const option = screen.getByRole('option', { name: 'Servidor local (compatible OpenAI)' })
    // Base UI solo confirma la selección de ratón si hubo pointerdown antes del click.
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.click(option)
    expect(screen.getByLabelText('URL del servidor local')).toBeInTheDocument()
  })

  it('usa el placeholder de clave guardada cuando hasKey es true', () => {
    renderForm({ hasKey: true })
    expect(screen.getByLabelText('Clave de API')).toHaveAttribute('placeholder', '•••• (guardada)')
  })

  it('Probar llama a testAiConnectionAction y muestra el resultado', async () => {
    testAiConnectionAction.mockResolvedValueOnce({ ok: true, data: { ok: true, message: 'OK', latencyMs: 42 } })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }))
    expect(await screen.findByText('Conectado en 42 ms')).toBeInTheDocument()
    expect(testAiConnectionAction).toHaveBeenCalledTimes(1)
  })

  it('Probar muestra el mensaje de fallo de conexión', async () => {
    testAiConnectionAction.mockResolvedValueOnce({ ok: true, data: { ok: false, message: 'timeout', latencyMs: 10 } })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }))
    expect(await screen.findByText('No se pudo conectar: timeout')).toBeInTheDocument()
  })

  it('Guardar llama a updateAiSettingsAction con un payload válido y apiKey vacía si no se tocó', async () => {
    updateAiSettingsAction.mockResolvedValueOnce({
      ok: true,
      data: { provider: 'anthropic', model: 'modelo-x', baseUrl: null, hasKey: true, monthlyCapCents: 500, structuredOutput: false, spentThisMonthCents: 0 },
    })
    renderForm({ provider: 'anthropic' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateAiSettingsAction).toHaveBeenCalledTimes(1))
    const payload = updateAiSettingsAction.mock.calls[0]?.[0]
    expect(AiSettingsSchema.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ provider: 'anthropic', apiKey: '' })
  })

  it('en solo lectura no muestra el formulario y sí el aviso de propietario', () => {
    renderForm({ readOnly: true })
    expect(screen.queryByTestId('ai-settings-form')).not.toBeInTheDocument()
    expect(screen.getByText('Solo el propietario puede cambiar la IA.')).toBeInTheDocument()
  })

  // Regla I3/14/24: `result.message` (texto de ServiceError/zod en español
  // crudo) nunca se pinta tal cual; se traduce por `result.code`.
  it('Guardar traduce el error por código en vez de pintar result.message crudo', async () => {
    updateAiSettingsAction.mockResolvedValueOnce({ ok: false, code: 'forbidden', message: 'Solo el propietario puede cambiar la IA (texto crudo del servicio)' })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No tienes permiso para hacer esto.')).toBeInTheDocument()
    expect(screen.queryByText(/texto crudo del servicio/)).not.toBeInTheDocument()
  })

  // Item 4: sin modelo de catálogo (aquí, anthropic siempre) se pide el
  // precio propio -si no, el gasto de ese proveedor se contabilizaría como 0
  // y el tope mensual nunca saltaría (I1).
  it('muestra el párrafo de ayuda y los precios propios cuando el modelo no está en el catálogo', () => {
    renderForm({ provider: 'anthropic', model: 'modelo-x' })
    expect(screen.getByText('Escribe el id tal como lo documenta el proveedor.')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio entrada (¢/Mtok)')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio salida (¢/Mtok)')).toBeInTheDocument()
  })

  it('oculta la ayuda y los precios propios cuando el modelo sí está en el catálogo', () => {
    renderForm({ provider: 'openai', model: 'gpt-4o-mini' })
    expect(screen.queryByText('Escribe el id tal como lo documenta el proveedor.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Precio entrada (¢/Mtok)')).not.toBeInTheDocument()
  })

  it('Guardar manda los precios propios y el payload pasa AiSettingsSchema (W2-R11)', async () => {
    updateAiSettingsAction.mockResolvedValueOnce({
      ok: true,
      data: { provider: 'anthropic', model: 'modelo-x', baseUrl: null, hasKey: true, monthlyCapCents: 500, structuredOutput: false, spentThisMonthCents: 0 },
    })
    renderForm({ provider: 'anthropic', model: 'modelo-x' })
    fireEvent.change(screen.getByLabelText('Precio entrada (¢/Mtok)'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Precio salida (¢/Mtok)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateAiSettingsAction).toHaveBeenCalledTimes(1))
    const payload = updateAiSettingsAction.mock.calls[0]?.[0]
    expect(AiSettingsSchema.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ priceInCentsPerMtok: 300, priceOutCentsPerMtok: 1500 })
  })

  it('Guardar sin modelo de catálogo y con el precio vacío manda null (borra el precio propio guardado)', async () => {
    updateAiSettingsAction.mockResolvedValueOnce({
      ok: true,
      data: { provider: 'anthropic', model: 'modelo-x', baseUrl: null, hasKey: true, monthlyCapCents: 500, structuredOutput: false, spentThisMonthCents: 0 },
    })
    renderForm({ provider: 'anthropic', model: 'modelo-x' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateAiSettingsAction).toHaveBeenCalledTimes(1))
    const payload = updateAiSettingsAction.mock.calls[0]?.[0]
    expect(AiSettingsSchema.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ priceInCentsPerMtok: null, priceOutCentsPerMtok: null })
  })

  it('Guardar con modelo de catálogo no manda las claves priceIn/OutCentsPerMtok', async () => {
    updateAiSettingsAction.mockResolvedValueOnce({
      ok: true,
      data: { provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, hasKey: true, monthlyCapCents: 500, structuredOutput: false, spentThisMonthCents: 0 },
    })
    renderForm({ provider: 'openai', model: 'gpt-4o-mini' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateAiSettingsAction).toHaveBeenCalledTimes(1))
    const payload = updateAiSettingsAction.mock.calls[0]?.[0]
    expect(AiSettingsSchema.safeParse(payload).success).toBe(true)
    expect(payload).not.toHaveProperty('priceInCentsPerMtok')
    expect(payload).not.toHaveProperty('priceOutCentsPerMtok')
  })

  // Item 1 de la revisión W2: `handleTest` traduce el código igual que `handleSave`,
  // nunca pinta `result.message` (texto crudo) cuando la propia acción falla.
  it('Probar traduce el error por código cuando la acción falla (no es la prueba de conexión en sí)', async () => {
    testAiConnectionAction.mockResolvedValueOnce({ ok: false, code: 'forbidden', message: 'Solo el propietario puede cambiar la IA (texto crudo del servicio)' })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }))
    expect(await screen.findByText('No tienes permiso para hacer esto.')).toBeInTheDocument()
    expect(screen.queryByText(/texto crudo del servicio/)).not.toBeInTheDocument()
  })
})
