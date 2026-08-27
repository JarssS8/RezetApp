import { Icon, type IconProps } from './icon'

export function VolumeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M18.5 7a7.5 7.5 0 0 1 0 10" />
    </Icon>
  )
}
