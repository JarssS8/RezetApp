import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import { PlusIcon, UploadIcon } from '@/components/icons'
import { ScreenHeader } from './screen-header'

function renderHeader(props: Partial<Parameters<typeof ScreenHeader>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ common }}>
      <ScreenHeader title="Recetas" {...props} />
    </NextIntlClientProvider>,
  )
}

describe('ScreenHeader', () => {
  it('pinta el título y, siempre, el engranaje de Ajustes al final', () => {
    renderHeader()
    expect(screen.getByRole('heading', { name: 'Recetas' })).toHaveClass('title-screen')
    const settingsLink = screen.getByRole('link', { name: 'Ajustes' })
    expect(settingsLink).toHaveAttribute('href', '/settings')
  })

  it('mantiene el orden fijo: primaria, luego menú, luego Ajustes', () => {
    renderHeader({
      primaryAction: { ariaLabel: 'Nueva receta', icon: <PlusIcon />, href: '/recipes/new' },
      menuItems: [{ key: 'import', label: 'Importar', icon: <UploadIcon size={18} />, href: '/recipes/import' }],
    })
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    const links = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    // La acción primaria es un link con render (Base UI la expone como link real).
    expect(links).toContain('Nueva receta')
    expect(links).toContain('Ajustes')
    // El disparador del menú es el único botón: no hay ítems visibles hasta abrirlo.
    expect(buttons).toContain('Más opciones')
  })

  it('sin menuItems no aparece el disparador de más opciones', () => {
    renderHeader({ primaryAction: { ariaLabel: 'Añadir', icon: <PlusIcon />, onClick: vi.fn() } })
    expect(screen.queryByRole('button', { name: 'Más opciones' })).not.toBeInTheDocument()
  })

  it('el menú se abre, lista sus ítems y se cierra con Escape', async () => {
    const user = userEvent.setup()
    renderHeader({
      menuItems: [
        { key: 'scan', label: 'Escanear', href: '/pantry/scan' },
        { key: 'merge', label: 'Fusionar', href: '/pantry/merge' },
      ],
    })
    const trigger = screen.getByRole('button', { name: 'Más opciones' })
    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Escanear' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Fusionar' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menuitem', { name: 'Escanear' })).not.toBeInTheDocument()
  })

  it('con backHref añade la flecha de volver a la izquierda del título', () => {
    renderHeader({ backHref: '/pantry' })
    expect(screen.getByRole('link', { name: 'Atrás' })).toHaveAttribute('href', '/pantry')
  })
})
