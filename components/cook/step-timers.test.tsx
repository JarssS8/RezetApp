import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '@/messages/es/cook.json'
import { StepTimers } from './step-timers'

function renderTimers(text: string) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ cook: messages }}>
      <StepTimers text={text} locale="es" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('StepTimers', () => {
  it('ofrece un botón por tramo detectado, con los minutos redondeados', () => {
    renderTimers('Pocha la cebolla 20 minutos y hornea 1 hora')
    expect(screen.getByRole('button', { name: /20 min/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /60 min/ })).toBeInTheDocument()
  })

  it('sin tramos no pinta nada', () => {
    const { container } = renderTimers('Sirve caliente')
    expect(container).toBeEmptyDOMElement()
  })

  it('al arrancar cuenta atrás en mm:ss', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTimers('Hierve 2 minutos')
    await user.click(screen.getByRole('button', { name: /2 min/ }))
    expect(screen.getByRole('status')).toHaveTextContent('02:00')
    await vi.advanceTimersByTimeAsync(61_000)
    expect(screen.getByRole('status')).toHaveTextContent('00:59')
  })

  it('al llegar a cero enseña el aviso de "listo" en la misma región en vivo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTimers('Hierve 2 minutos')
    await user.click(screen.getByRole('button', { name: /2 min/ }))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(screen.getByRole('status')).toHaveTextContent('¡Listo!')
  })
})
