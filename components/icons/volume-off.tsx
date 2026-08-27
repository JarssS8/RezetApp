import { Icon, type IconProps } from './icon'

export function VolumeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="m16.5 10 5 4" />
      <path d="m21.5 10-5 4" />
    </Icon>
  )
}
