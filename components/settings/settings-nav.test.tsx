import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import settings from '@/messages/es/settings.json'
import { SETTINGS_SECTIONS, SettingsNav } from './settings-nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/ai' }))

describe('SettingsNav', () => {
  it('lista las nueve secciones y marca la activa', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ settings }}>
        <SettingsNav />
      </NextIntlClientProvider>,
    )
    expect(SETTINGS_SECTIONS).toHaveLength(9)
    expect(screen.getAllByRole('link')).toHaveLength(9)
    expect(screen.getByRole('link', { name: 'Inteligencia artificial' })).toHaveAttribute('aria-current', 'page')
  })
})
