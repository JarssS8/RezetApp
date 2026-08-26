import { Icon, type IconProps } from './icon'
export function UserMinusIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="9" cy="8.5" r="4" /><path d="M2 20c.7-3.6 3.6-5.5 7-5.5s5.6 1.5 6.5 4M14.5 11h6" />
    </Icon>
  )
}
