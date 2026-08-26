import { Icon, type IconProps } from './icon'

export function SparklesIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11 3.5l1.2 3.4 3.4 1.2-3.4 1.2L11 12.7l-1.2-3.4-3.4-1.2 3.4-1.2L11 3.5Z" />
      <path d="M18 13l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </Icon>
  )
}
