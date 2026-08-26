import { Icon, type IconProps } from './icon'
export function PantryIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M12 3.5v17M4 12h16" />
      <path d="M9.5 7.5v1.5M14.5 7.5v1.5M9.5 15.5v1.5M14.5 15.5v1.5" />
    </Icon>
  )
}
