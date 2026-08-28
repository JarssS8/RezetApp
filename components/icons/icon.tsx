import type { ReactNode } from 'react'

export type IconProps = { size?: number; className?: string; title?: string; strokeWidth?: number }

// Todos los iconos comparten trazo 1.85, extremos redondos y currentColor. El
// trazo se puede engordar (2.2 es el valor que usa la barra inferior en la
// pestaña activa) sin redibujar nada: es la única forma de que un icono a
// medida tenga estado sin duplicar el fichero.
export function Icon({ size = 24, className, title, strokeWidth = 1.85, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}
