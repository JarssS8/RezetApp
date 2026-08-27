import { Icon, type IconProps } from './icon'
export function MergeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 4v5a5 5 0 0 0 5 5h7" />
      <path d="M18 4v5a5 5 0 0 1-5 5" />
      <path d="m15.5 11 2.5 3-2.5 3" />
    </Icon>
  )
}
