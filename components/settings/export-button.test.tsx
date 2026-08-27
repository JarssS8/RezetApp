import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import settings from '@/messages/es/settings.json'
import { ExportButton } from './export-button'

const { exportRecipesAction } = vi.hoisted(() => ({ exportRecipesAction: vi.fn() }))
vi.mock('@/lib/actions/recipes', () => ({ exportRecipesAction }))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderButton() {
  render(
    <NextIntlClientProvider locale="es" messages={{ settings }}>
      <ExportButton />
    </NextIntlClientProvider>,
  )
}

// Item 25: el nombre del fichero descargado sale de i18n (settings.data.exportFilename),
// no de una plantilla en español fija en el componente.
describe('ExportButton', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('nombra el fichero descargado con la clave i18n exportFilename', async () => {
    exportRecipesAction.mockResolvedValue({ ok: true, data: { recipes: [] } })
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: 'Exportar recetas' }))

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    const link = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement
    expect(link.download).toBe('recetas-2026-08-27.json')
  })
})
