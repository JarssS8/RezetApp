import { Icon, type IconProps } from './icon'
export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
    </Icon>
  )
}
