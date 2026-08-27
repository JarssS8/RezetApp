import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import cook from '@/messages/es/cook.json'
import { StepTimers } from './step-timers'

const playAlarm = vi.fn()
vi.mock('./alarm', () => ({ playAlarm: () => playAlarm() }))

function renderTimers(props: Partial<React.ComponentProps<typeof StepTimers>> = {}) {
  render(
    <NextIntlClientProvider locale="es" messages={{ cook }}>
      <StepTimers text="Hornea 25 minutos y reposa 5 minutos" locale="es" stepIndex={0} timerSeconds={null} {...props} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => playAlarm.mockClear())
afterEach(() => vi.useRealTimers())

describe('StepTimers', () => {
  it('ofrece un botón por tramo detectado y otro por el temporizador explícito', () => {
    renderTimers({ text: 'Hornea 25 minutos', timerSeconds: 600 })
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /25 min/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /10 min/ })).toBeVisible()
  })

  it('distingue el temporizador explícito del detectado en el texto para lectores de pantalla', () => {
    renderTimers({ text: 'Hornea 25 minutos', timerSeconds: 600 })
    expect(screen.getByRole('button', { name: new RegExp(`${cook.timerExplicit}.*10 min`) })).toBeVisible()
    expect(screen.getByRole('button', { name: '25 min' })).toBeVisible()
  })

  it('arranca dos a la vez y los pinta con su cuenta atrás', async () => {
    const user = userEvent.setup()
    renderTimers()
    await user.click(screen.getByRole('button', { name: /25 min/ }))
    await user.click(screen.getByRole('button', { name: /5 min/ }))
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })

  it('suena la alarma al llegar a cero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTimers({ text: 'Reposa 1 minuto' })
    await user.click(screen.getByRole('button', { name: /1 min/ }))
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    expect(playAlarm).toHaveBeenCalledTimes(1)
    expect(screen.getByText(cook.timerDone)).toBeVisible()
  })

  it('cambiar de paso no cancela lo que ya está corriendo', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <NextIntlClientProvider locale="es" messages={{ cook }}>
        <StepTimers text="Hornea 25 minutos" locale="es" stepIndex={0} timerSeconds={null} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: /25 min/ }))
    rerender(
      <NextIntlClientProvider locale="es" messages={{ cook }}>
        <StepTimers text="Sirve caliente" locale="es" stepIndex={1} timerSeconds={null} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('status')).toBeVisible()
  })

  it('sin tramos ni temporizador explícito no pinta nada', () => {
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={{ cook }}>
        <StepTimers text="Sirve caliente" locale="es" stepIndex={0} timerSeconds={null} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
