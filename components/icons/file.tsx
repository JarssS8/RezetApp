import { Icon, type IconProps } from './icon'

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3h7l4.5 4.5V21H6.5z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9.5 13h5" />
      <path d="M9.5 16.5h5" />
    </Icon>
  )
}
