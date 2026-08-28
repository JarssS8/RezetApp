import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import plan from '@/messages/es/plan.json'
import recipes from '@/messages/es/recipes.json'
import { PlanBatchSchema } from '@/lib/validation/plan'
import { AddEntrySheet, type AddEntrySheetProps } from './add-entry-sheet'

const { applyPlanBatchAction, searchRecipesForPlanAction } = vi.hoisted(() => ({
  applyPlanBatchAction: vi.fn(),
  searchRecipesForPlanAction: vi.fn(),
}))
vi.mock('@/lib/actions/plan', () => ({ applyPlanBatchAction, searchRecipesForPlanAction }))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

afterEach(() => {
  vi.clearAllMocks()
})

const BASE_PROPS: AddEntrySheetProps = {
  open: true,
  onOpenChange: vi.fn(),
  days: ['2026-08-24', '2026-08-25', '2026-08-26'],
  defaultDate: '2026-08-24',
  defaultSlot: 'lunch',
  initialRecipeId: null,
  initialServings: 2,
  onAdded: vi.fn(),
}

function renderSheet(props: Partial<AddEntrySheetProps> = {}) {
  const onAdded = vi.fn()
  render(
    <NextIntlClientProvider locale="es" messages={{ plan, common, recipes }}>
      <AddEntrySheet {...BASE_PROPS} onAdded={onAdded} {...props} />
    </NextIntlClientProvider>,
  )
  return { onAdded }
}

function goFreeMode(title: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Comida libre' }))
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: title } })
}

describe('AddEntrySheet', () => {
  // Regresión I7 (item 19): antes, un fallo de applyPlanBatchAction no
  // mostraba nada -la hoja se quedaba "colgada" sin decir por qué no se
  // había añadido la comida-.
  it('avisa con un toast y no llama a onAdded si applyPlanBatchAction falla', async () => {
    applyPlanBatchAction.mockResolvedValue({ ok: false, code: 'validation', message: 'Datos inválidos' })
    const { onAdded } = renderSheet()
    goFreeMode('Pizza de la esquina')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(applyPlanBatchAction).toHaveBeenCalledTimes(1))
    expect(toastError).toHaveBeenCalledWith('No se pudo añadir al plan')
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('llama a onAdded cuando applyPlanBatchAction tiene éxito', async () => {
    applyPlanBatchAction.mockResolvedValue({ ok: true, data: { added: [], removed: [] } })
    const { onAdded } = renderSheet()
    goFreeMode('Pizza de la esquina')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1))
    expect(toastError).not.toHaveBeenCalled()
  })

  // W2-R11: el payload real que arma la hoja (título libre + fecha/hueco/
  // raciones) tiene que pasar el esquema real de lib/validation/plan.ts.
  it('el payload de una comida libre es válido según PlanBatchSchema', async () => {
    applyPlanBatchAction.mockResolvedValue({ ok: true, data: { added: [], removed: [] } })
    renderSheet({ defaultDate: '2026-08-25', defaultSlot: 'dinner' })
    goFreeMode('Pizza de la esquina')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(applyPlanBatchAction).toHaveBeenCalledTimes(1))
    const payload = applyPlanBatchAction.mock.calls[0]?.[0]
    expect(PlanBatchSchema.safeParse(payload).success).toBe(true)
    expect(payload).toEqual({ add: [{ date: '2026-08-25', slot: 'dinner', customTitle: 'Pizza de la esquina', servings: 2 }], remove: [] })
  })

  it('el payload de una receta seleccionada es válido según PlanBatchSchema', async () => {
    applyPlanBatchAction.mockResolvedValue({ ok: true, data: { added: [], removed: [] } })
    renderSheet({ initialRecipeId: '11111111-1111-4111-8111-111111111111' })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(applyPlanBatchAction).toHaveBeenCalledTimes(1))
    const payload = applyPlanBatchAction.mock.calls[0]?.[0]
    expect(PlanBatchSchema.safeParse(payload).success).toBe(true)
    expect(payload).toEqual({
      add: [{ date: '2026-08-24', slot: 'lunch', recipeId: '11111111-1111-4111-8111-111111111111', servings: 2 }],
      remove: [],
    })
  })

  // Item 19: el schema (PlanEntryInputSchema.servings) tiene un tope de 100
  // raciones; el stepper compartido (ServingsStepper, item 23) ya no deja
  // subir de ahí.
  it('el stepper de raciones no deja pasar de 100', () => {
    renderSheet({ initialServings: 100 })
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Más raciones' })).toBeDisabled()
  })

  it('el tiempo disponible viaja en el lote y el lote es válido; vacío no lo manda', async () => {
    applyPlanBatchAction.mockResolvedValue({ ok: true, data: { added: [], removed: [] } })
    renderSheet()
    goFreeMode('Pizza')
    fireEvent.change(screen.getByLabelText('Tiempo disponible (min)'), { target: { value: '30' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(applyPlanBatchAction).toHaveBeenCalledTimes(1))
    // W2-R11: lo que el componente manda se valida contra el esquema real.
    const sent = applyPlanBatchAction.mock.calls[0]?.[0]
    expect(PlanBatchSchema.safeParse(sent).success).toBe(true)
    expect(sent?.add[0]?.timeBudgetMinutes).toBe(30)
  })

  it('sin tiempo disponible, la propiedad no se manda (exactOptionalPropertyTypes)', async () => {
    applyPlanBatchAction.mockResolvedValue({ ok: true, data: { added: [], removed: [] } })
    renderSheet()
    goFreeMode('Pizza')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(applyPlanBatchAction).toHaveBeenCalledTimes(1))
    const sent = applyPlanBatchAction.mock.calls[0]?.[0]
    expect(PlanBatchSchema.safeParse(sent).success).toBe(true)
    expect(sent?.add[0]).not.toHaveProperty('timeBudgetMinutes')
  })
})
