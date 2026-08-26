import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import settings from '@/messages/es/settings.json'
import { AiSettingsSchema } from '@/lib/validation/household'
import { AiSettingsForm, type AiSettingsFormProps } from './ai-settings-form'

const { testAiConnectionAction, updateAiSettingsAction } = vi.hoisted(() => ({
  testAiConnectionAction: vi.fn(),
  updateAiSettingsAction: vi.fn(),
}))

vi.mock('@/lib/actions/ai', () => ({ testAiConnectionAction, updateAiSettingsAction }))

const BASE_PROPS: AiSettingsFormProps = {
  provider: 'none',
  model: null,
  baseUrl: null,
  hasKey: false,
  monthlyCapCents: 500,
  structuredOutput: false,
  spentThisMonthCents: 320,
  readOnly: false,
}

function renderForm(props: Partial<AiSettingsFormProps> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ common, settings }}>
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
})
