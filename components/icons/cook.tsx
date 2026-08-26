import { Icon, type IconProps } from './icon'
export function CookIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <ellipse cx="10" cy="13" rx="7" ry="4.2" />
      <path d="M3.3 14.5c.6 2.4 3.4 4 6.7 4s6.1-1.6 6.7-4" />
      <path d="M17 12.2l4.2-2.4" />
      <path d="M8.5 7.5c0-1 .8-1.3.8-2.3S8.5 4 8.5 3M11.5 7.5c0-1 .8-1.3.8-2.3S11.5 4 11.5 3" />
    </Icon>
  )
}
