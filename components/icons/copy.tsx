import { Icon, type IconProps } from './icon'
export function CopyIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
    </Icon>
  )
}
