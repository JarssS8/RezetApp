import { Icon, type IconProps } from './icon'
export function ClockIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </Icon>
  )
}
