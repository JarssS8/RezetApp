'use client'

import Link from 'next/link'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { ChevronLeftIcon, MoreIcon, SettingsIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

export interface ScreenHeaderPrimaryAction {
  ariaLabel: string
  // Ya renderizado (p. ej. `<PlusIcon />`), no el componente: ScreenHeader es
  // cliente y las páginas que lo llaman son de servidor — pasar la función del
  // icono en vez del elemento rompe la serialización RSC (no es un Server
  // Action ni un elemento, es un valor de función suelto).
  icon: ReactNode
  // Con label, el botón lleva texto visible (además del icono); sin ella
  // queda icono-solo y ariaLabel es el único nombre accesible.
  label?: string
  href?: string
  onClick?: () => void
}

export interface ScreenHeaderMenuItem {
  key: string
  label: string
  icon?: ReactNode
  href?: string
  onClick?: () => void
}

export interface ScreenHeaderProps {
  title: string
  // Flecha a la izquierda del título; sustituye la barra inferior como forma
  // de volver en las subpantallas que no son una de las cinco pestañas.
  backHref?: string
  // Como mucho una: siempre en la misma posición, antes del menú y del engranaje.
  primaryAction?: ScreenHeaderPrimaryAction
  // El icono de "más opciones" solo aparece si hay algo que meter dentro.
  menuItems?: ScreenHeaderMenuItem[]
}

// W8: un único patrón de cabecera para las cinco pantallas y sus
// subpantallas con vuelta atrás, en vez de que cada una decida a mano qué
// botones enseña (el usuario los veía aparecer/desaparecer sin ton ni son).
// Orden fijo a la derecha: acción primaria → menú desbordado → Ajustes,
// que se pinta siempre y siempre el último.
export function ScreenHeader({ title, backHref, primaryAction, menuItems = [] }: ScreenHeaderProps) {
  const c = useTranslations('common')

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={c('actions.back')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2 transition-colors duration-(--dur-1) ease-(--ease-out) hover:text-text"
          >
            <ChevronLeftIcon />
          </Link>
        ) : null}
        <h1 className="title-screen">{title}</h1>
      </div>
      {/* Auditoría W7, hallazgo 2.1: 4px entre objetivos táctiles de 44px. */}
      <div className="flex items-center gap-2">
        {primaryAction ? <PrimaryActionButton action={primaryAction} /> : null}
        {menuItems.length > 0 ? <OverflowMenu items={menuItems} moreLabel={c('more')} /> : null}
        <Link
          href="/settings"
          aria-label={c('settings')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2 transition-colors duration-(--dur-1) ease-(--ease-out) hover:text-text"
        >
          <SettingsIcon />
        </Link>
      </div>
    </div>
  )
}

function PrimaryActionButton({ action }: { action: ScreenHeaderPrimaryAction }) {
  const linkProps = action.href ? { render: <Link href={action.href} /> } : {}
  if (action.label) {
    return (
      <Button variant="default" aria-label={action.ariaLabel} onClick={action.onClick} {...linkProps}>
        {action.icon}
        {action.label}
      </Button>
    )
  }
  return (
    <Button variant="default" size="icon" aria-label={action.ariaLabel} onClick={action.onClick} {...linkProps}>
      {action.icon}
    </Button>
  )
}

function OverflowMenu({ items, moreLabel }: { items: ScreenHeaderMenuItem[]; moreLabel: string }) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger render={<Button variant="ghost" size="icon" aria-label={moreLabel} />}>
        <MoreIcon />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner align="end" sideOffset={8} className="z-50 outline-none">
          <MenuPrimitive.Popup
            className="min-w-44 rounded-md border border-line-2 bg-popover p-1 text-sm text-popover-foreground shadow-raised duration-(--dur-2) data-closed:duration-(--dur-1) outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {items.map((item) => (
              <MenuItemRow key={item.key} item={item} />
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}

function MenuItemRow({ item }: { item: ScreenHeaderMenuItem }) {
  const content: ReactNode = (
    <>
      {item.icon}
      {item.label}
    </>
  )
  const className = 'flex min-h-11 w-full items-center gap-2 rounded-sm px-3 outline-none data-highlighted:bg-muted'
  if (item.href) {
    return (
      <MenuPrimitive.LinkItem render={<Link href={item.href} />} className={className}>
        {content}
      </MenuPrimitive.LinkItem>
    )
  }
  return (
    <MenuPrimitive.Item onClick={item.onClick} className={className}>
      {content}
    </MenuPrimitive.Item>
  )
}
