import { Icon, type IconProps } from './icon'
export function TodayIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M12 2.5v1.6M17.3 4.7l-1.1 1.1M6.7 4.7l1.1 1.1M20 9h-1.6M5.6 9H4" />
      <path d="M3.5 16.5h17M6 16.5c0 2.2 2.7 3.5 6 3.5s6-1.3 6-3.5" />
    </Icon>
  )
}
