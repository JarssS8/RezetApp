import { Icon, type IconProps } from './icon'
export function TagIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3.5 11.5 11 4h8.5v8.5L12 20z" />
      <circle cx="15.5" cy="8.5" r="1.3" />
    </Icon>
  )
}
