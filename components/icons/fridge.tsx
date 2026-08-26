import { Icon, type IconProps } from './icon'
export function FridgeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5.5" y="3" width="13" height="18" rx="2.5" /><path d="M5.5 10h13M9 6.5v1.5M9 13v2.5" />
    </Icon>
  )
}
