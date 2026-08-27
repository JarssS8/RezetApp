'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { exportRecipesAction } from '@/lib/actions/recipes'

// Botón de settings/data (Tarea 12): descarga todas las recetas del hogar en
// un JSON, mismo formato que produce exportRecipesAction (MCP y REST comparten
// ese servicio, docs/06-SHOPLIST.md no aplica aquí — esto no es la compra).
export function ExportButton() {
  const t = useTranslations('settings')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const result = await exportRecipesAction()
      if (!result.ok) {
        toast.error(t('data.exportError'))
        return
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
      const objectUrl = URL.createObjectURL(blob)
      const today = new Date().toISOString().slice(0, 10)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `recetas-${today}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button type="button" variant="outline" aria-busy={exporting} disabled={exporting} onClick={() => void handleExport()}>
      {t('data.export')}
    </Button>
  )
}
