import { Icon, type IconProps } from './icon'
export function ChartIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 20V12" />
      <path d="M12 20V5" />
      <path d="M19 20v-5" />
      <path d="M3.5 20h17" />
    </Icon>
  )
}
