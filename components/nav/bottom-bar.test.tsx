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
})
