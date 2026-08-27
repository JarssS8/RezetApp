import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RegisterServiceWorker } from './register-sw'

describe('RegisterServiceWorker', () => {
  it('registra el service worker cuando el navegador lo soporta', async () => {
    const register = vi.fn(async () => ({}))
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
    render(<RegisterServiceWorker />)
    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' }))
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('sin soporte no revienta ni pinta nada', () => {
    const { container } = render(<RegisterServiceWorker />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un fallo del registro se traga en silencio', async () => {
    const register = vi.fn(async () => {
      throw new Error('no')
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
    render(<RegisterServiceWorker />)
    await waitFor(() => expect(register).toHaveBeenCalled())
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })
})
