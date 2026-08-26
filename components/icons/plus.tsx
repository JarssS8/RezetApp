import { Icon, type IconProps } from './icon'
export function PlusIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}
