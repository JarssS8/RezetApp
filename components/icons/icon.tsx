import type { ReactNode } from 'react'

export type IconProps = { size?: number; className?: string; title?: string }

// Todos los iconos comparten trazo 1.85, extremos redondos y currentColor.
export function Icon({ size = 24, className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
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
