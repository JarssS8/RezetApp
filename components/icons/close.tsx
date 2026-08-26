import { Icon, type IconProps } from './icon'

export function CloseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}
