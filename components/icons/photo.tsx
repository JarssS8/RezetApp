import { Icon, type IconProps } from './icon'
export function PhotoIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 15.5l-4.5-4.5-7 7" />
    </Icon>
  )
}
