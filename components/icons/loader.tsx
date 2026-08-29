import { Icon, type IconProps } from './icon'
// Anillo con un cuarto abierto: girando con animate-spin (Button, auditoría
// W7, hallazgo 2.4) se lee como progreso, no como un reloj parado.
export function LoaderIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" opacity="0.25" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
    </Icon>
  )
}
