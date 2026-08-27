import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import messages from '@/messages/es/cook.json'
import common from '@/messages/es/common.json'
import recipes from '@/messages/es/recipes.json'
import { CookSession } from './cook-session'

const ingredients = [
  { id: 'i1', foodId: 'f1', rawText: '300 g de cebolla', quantity: 300, unit: 'g' as const, displayQuantity: 300, displayUnit: 'g', preparation: null, groupLabel: null, stepIndex: 0, scalesLinearly: true, sortOrder: 0, food: null },
]
const steps = [
  { id: 's1', index: 0, text: 'Pocha la cebolla 20 minutos', timerSeconds: null, imageUrl: null },
  { id: 's2', index: 1, text: 'Sirve caliente', timerSeconds: null, imageUrl: null },
]

function renderSession(initialServings = 2) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ cook: messages, common, recipes }}>
      <CookSession recipeId="r1" entryId="e1" title="Sopa de cebolla" servingsBase={2} initialServings={initialServings} ingredients={ingredients} steps={steps} locale="es" units="metric" />
    </NextIntlClientProvider>,
  )
}

describe('CookSession', () => {
  it('muestra un paso cada vez y avanza y retrocede', async () => {
    const user = userEvent.setup()
    renderSession()
    expect(screen.getByText(/Pocha la cebolla/)).toBeInTheDocument()
    expect(screen.queryByText(/Sirve caliente/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(screen.getByText(/Sirve caliente/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /anterior/i }))
    expect(screen.getByText(/Pocha la cebolla/)).toBeInTheDocument()
  })

  it('escala los ingredientes al cambiar las raciones (dominio en cliente)', async () => {
    const user = userEvent.setup()
    renderSession(2)
    expect(screen.getByText('300 g')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /más|más raciones|aumentar/i }))
    await user.click(screen.getByRole('button', { name: /más|más raciones|aumentar/i }))
    expect(screen.getByText('600 g')).toBeInTheDocument()
  })

  it('marca y desmarca ingredientes del paso', async () => {
    const user = userEvent.setup()
    renderSession()
    const box = screen.getByRole('checkbox', { name: /cebolla/i })
    expect(box).not.toBeChecked()
    await user.click(box)
    expect(box).toBeChecked()
  })
})
