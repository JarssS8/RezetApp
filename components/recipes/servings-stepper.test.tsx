import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import { ServingsStepper } from './servings-stepper'

function renderStepper(props: Partial<React.ComponentProps<typeof ServingsStepper>> & { onChange: (value: number) => void }) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ recipes }}>
      <ServingsStepper value={4} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('ServingsStepper', () => {
  afterEach(cleanup)

  it('incrementa las raciones al pulsar +', () => {
    const onChange = vi.fn()
    renderStepper({ value: 4, onChange })
    fireEvent.click(screen.getByRole('button', { name: recipes.detail.more }))
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('no baja de min (deshabilita el botón − y no llama a onChange)', () => {
    const onChange = vi.fn()
    renderStepper({ value: 1, min: 1, onChange })
    const fewer = screen.getByRole('button', { name: recipes.detail.fewer })
    expect(fewer).toBeDisabled()
    fireEvent.click(fewer)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('no sube de max (deshabilita el botón +)', () => {
    const onChange = vi.fn()
    renderStepper({ value: 100, max: 100, onChange })
    const more = screen.getByRole('button', { name: recipes.detail.more })
    expect(more).toBeDisabled()
    fireEvent.click(more)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('botones táctiles (min-h-11 min-w-11) y número en tabular', () => {
    renderStepper({ value: 4, onChange: vi.fn() })
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('min-h-11')
      expect(button).toHaveClass('min-w-11')
    }
    expect(screen.getByText('4')).toHaveClass('tabular')
  })
})
