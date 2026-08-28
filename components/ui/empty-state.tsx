import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '@/components/icons'

export interface EmptyStateProps {
  icon: ComponentType<IconProps>
  title: string
  description?: string
  action?: ReactNode
}

// El vacío deja de ser un párrafo gris. Ocho pantallas lo comparten, así que la
// forma vive aquí y no en cada una: caja hundida, icono a medida a 40 px dentro
// de un círculo de acento suave, título en display y, si hace falta, una frase
// y una acción.
//
// Sin 'use client' y sin estado: lo usan páginas de servidor (cook, recipes,
// proposals) y componentes de cliente (today-view, week-view, pantry-list).
//
// El icono es decorativo (aria-hidden): el título ya dice lo que pasa, y un
// lector de pantalla que anunciara "icono de despensa" antes del texto solo
// añadiría ruido.
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-sunken px-6 py-10 text-center">
      <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-pill bg-acc-soft text-acc-ink">
        <Icon size={40} />
      </span>
      <p className="title-content">{title}</p>
      {description ? <p className="max-w-[38ch] text-sm text-text-2">{description}</p> : null}
      {action}
    </div>
  )
}
