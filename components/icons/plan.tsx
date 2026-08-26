import { Icon, type IconProps } from './icon'
export function PlanIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.8h17M8 3v3.5M16 3v3.5" />
      <path d="M8 14h2.5M13.5 14H16M8 17.2h2.5" />
    </Icon>
  )
}
