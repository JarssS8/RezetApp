import type { ReactNode } from 'react'
import { WarningIcon } from '@/components/icons'

export interface WarnPanelProps {
  title: string
  children: ReactNode
  footer?: ReactNode
}

// El aviso ámbar de "caduca pronto", que hasta W6 estaba duplicado palabra por
// palabra entre components/today/today-view.tsx y
// components/pantry/expiring-panel.tsx. El patrón --warn-soft + WarningIcon es
// de la lista "no tocar" del informe de identidad: se mueve tal cual, solo el
// texto pequeño pasa a --warn-ink (2,58:1 -> 4,74:1 sobre el ámbar tenue).
export function WarnPanel({ title, children, footer }: WarnPanelProps) {
  return (
    <section className="rounded-lg border border-warn/40 bg-warn-soft p-3 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-warn-ink">
        <WarningIcon size={18} />
        {title}
      </h2>
      <div className="mt-2">{children}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  )
}
