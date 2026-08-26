import { Icon, type IconProps } from './icon'
export function DragIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
    </Icon>
  )
}
