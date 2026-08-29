import { Icon, type IconProps } from './icon'
// Rueda dentada clásica (ajustes). El dibujo anterior (círculo + rayos) se
// leía como un sol, es decir, como un conmutador de tema — no como Ajustes.
export function SettingsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8l1.05 2.1a7.2 7.2 0 0 1 2.1.87l2.23-.78 1.63 1.63-.78 2.23a7.2 7.2 0 0 1 .87 2.1L21.2 12l-2.1 1.05a7.2 7.2 0 0 1-.87 2.1l.78 2.23-1.63 1.63-2.23-.78a7.2 7.2 0 0 1-2.1.87L12 21.2l-1.05-2.1a7.2 7.2 0 0 1-2.1-.87l-2.23.78-1.63-1.63.78-2.23a7.2 7.2 0 0 1-.87-2.1L2.8 12l2.1-1.05a7.2 7.2 0 0 1 .87-2.1l-.78-2.23 1.63-1.63 2.23.78a7.2 7.2 0 0 1 2.1-.87L12 2.8z" />
    </Icon>
  )
}
