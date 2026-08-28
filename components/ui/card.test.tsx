import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardFooter } from './card'

describe('Card', () => {
  it('se define por superficie: sombra de tarjeta y borde suave, no borde duro', () => {
    // eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz
    render(<Card data-testid="c">contenido</Card>)
    const card = screen.getByTestId('c')
    expect(card.className).toContain('shadow-card')
    expect(card.className).toContain('border-line-2')
    expect(card.className).not.toMatch(/\bborder-border\b/)
  })

  it('el pie usa la superficie hundida del proyecto, no el gris de catálogo', () => {
    // eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz
    render(<CardFooter data-testid="f">pie</CardFooter>)
    expect(screen.getByTestId('f').className).toContain('bg-surface-sunken')
    expect(screen.getByTestId('f').className).not.toContain('bg-muted/50')
  })
})

describe('Sheet', () => {
  it('la hoja inferior redondea las esquinas de arriba', () => {
    // Se lee el fuente en vez de montar la hoja: Sheet es un portal de Base UI
    // con estado de apertura, y lo que se protege aquí es una clase de la
    // variante `data-[side=bottom]`, no un comportamiento.
    const source = readFileSync(join(import.meta.dirname, 'sheet.tsx'), 'utf8')
    const bottom = source.slice(source.indexOf('data-[side=bottom]'))
    expect(bottom).toContain('rounded-t-lg')
  })
})
