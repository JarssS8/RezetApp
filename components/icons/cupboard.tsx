import { Icon, type IconProps } from './icon'
export function CupboardIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M4 9h16M4 14.5h16M8 6v.2M8 11.5v.2M8 17v.2" />
    </Icon>
  )
}
