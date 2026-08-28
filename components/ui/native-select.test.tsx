import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NativeSelect } from './native-select'

describe('NativeSelect', () => {
  it('es un <select> nativo: se puede elegir una opción por su texto', async () => {
    const onChange = vi.fn()
    render(
      <NativeSelect aria-label="unidad" defaultValue="g" onChange={onChange}>
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <option value="g">gramos</option>
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <option value="ml">mililitros</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: 'unidad' })
    expect(select.tagName).toBe('SELECT')
    await userEvent.selectOptions(select, 'ml')
    expect(onChange).toHaveBeenCalled()
    expect((select as HTMLSelectElement).value).toBe('ml')
  })

  it('cumple el objetivo táctil de 44 px y no pinta color fuera de los tokens', () => {
    render(
      <NativeSelect aria-label="unidad">
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <option value="g">gramos</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: 'unidad' })
    expect(select.className).toContain('min-h-11')
    // La regla de AGENTS.md: nada de la paleta cruda de Tailwind en un componente base.
    expect(select.className).not.toMatch(/\b(bg|text|border)-(gray|slate|zinc|neutral|red|green|blue)-\d/)
  })

  it('conserva los atributos del hueco y añade los suyos al className', () => {
    render(
      <NativeSelect id="unidad" aria-label="unidad" disabled className="w-full text-xs">
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <option value="g">gramos</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: 'unidad' })
    expect(select.id).toBe('unidad')
    expect(select).toBeDisabled()
    expect(select.className).toContain('w-full')
    expect(select.className).toContain('text-xs')
  })
})
