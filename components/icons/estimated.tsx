import { Icon, type IconProps } from './icon'
export function EstimatedIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" /><path d="M12 8v4.5M12 16v.2" />
    </Icon>
  )
}
