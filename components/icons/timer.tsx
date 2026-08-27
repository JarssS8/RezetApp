import { Icon, type IconProps } from './icon'

export function TimerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.8" />
      <path d="M9.5 2.5h5" />
    </Icon>
  )
}
