import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import { BottomBar } from './bottom-bar'

vi.mock('next/navigation', () => ({ usePathname: () => '/plan' }))

describe('BottomBar', () => {
  it('pinta cinco pestañas y marca la activa', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
  })

  it('la pestaña activa lleva la píldora de acento y el icono a trazo grueso', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    const active = screen.getByRole('link', { name: 'Plan' })
    // La píldora vive DENTRO del área táctil: el enlace sigue midiendo 56 px.
    expect(active.className).toContain('min-h-14')
    const pill = active.querySelector('.pill-selected')
    expect(pill).not.toBeNull()
    expect(pill?.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.2')

    const idle = screen.getByRole('link', { name: 'Hoy' })
    expect(idle.querySelector('.pill-selected')).toBeNull()
    expect(idle.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.85')
  })

  it('el texto de la barra vuelve a la escala tipográfica de la app', () => {
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    // text-[11px] era el único tamaño fuera de escala del repositorio.
    expect(container.innerHTML).not.toContain('text-[11px]')
  })
})
