'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { LinkIcon, SendIcon } from '@/components/icons'
import { pushShoppingAction } from '@/lib/actions/shopping'
import type { ShoppingLine } from '@/lib/domain'
import { Button } from '@/components/ui/button'

export interface ShoppingPushButtonProps {
  lines: ShoppingLine[]
  /** true cuando el hogar (o el entorno) tiene ShopList configurado. */
  canPush: boolean
  /** Enlace "Abrir en ShopList" calculado en la página (server): los
   * componentes no importan lib/integrations. */
  deepLink: string | null
}

// Botón "Enviar a ShopList" del resumen de compra. Sin líneas no hay nada que
// enviar (ShoppingPushSchema exige al menos una); sin config de hogar/entorno
// se muestra un aviso en vez del botón (regla 5: RezetApp no es la lista).
export function ShoppingPushButton({ lines, canPush, deepLink }: ShoppingPushButtonProps) {
  const t = useTranslations('plan.shopping')
  const [pending, setPending] = useState(false)
  const [inserted, setInserted] = useState<number | null>(null)

  if (lines.length === 0) return null

  if (!canPush) {
    return <p className="text-sm text-text-2">{t('noConfig')}</p>
  }

  async function handlePush() {
    setPending(true)
    try {
      const result = await pushShoppingAction(lines)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setInserted(result.data.inserted)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => void handlePush()} disabled={pending} aria-busy={pending} className="self-start">
        <SendIcon size={16} />
        {t('send')}
      </Button>
      {inserted !== null && (
        <p role="status" className="flex items-center gap-2 text-sm text-text-2">
          {t('sent', { count: inserted })}
          {deepLink && (
            <a href={deepLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary">
              <LinkIcon size={16} />
              {t('openList')}
            </a>
          )}
        </p>
      )}
    </div>
  )
}
