import { Icon, type IconProps } from './icon'
export function UserIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="8.5" r="4" /><path d="M4.5 20c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
    </Icon>
  )
}
