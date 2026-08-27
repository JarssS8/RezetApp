import { Icon, type IconProps } from './icon'
export function BellIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Icon>
  )
}
