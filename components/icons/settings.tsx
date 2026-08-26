import { Icon, type IconProps } from './icon'
export function SettingsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6" />
    </Icon>
  )
}
