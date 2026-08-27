'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { UploadIcon } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { importRecipesAction } from '@/lib/actions/recipes'

// FileReader en vez de file.text(): la lectura de texto de Blob/File por
// promesa no está implementada en jsdom (entorno de los tests de componentes),
// mientras que FileReader sí, y funciona igual en cualquier navegador real.
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

// Lee el JSON en el navegador y manda el objeto ya parseado a la acción: un
// fichero que no es JSON se corta aquí, sin gastar un viaje al servidor.
export function ImportButton() {
  const t = useTranslations('settings')
  const [result, setResult] = useState<{ created: number; failed: string[] } | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setResult(null)
    setError(false)
    setBusy(true)
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await readFileAsText(file))
      } catch {
        setError(true)
        return
      }
      const res = await importRecipesAction(parsed)
      if (res.ok) setResult(res.data)
      else setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="import-json" className="flex items-center gap-1.5">
        <UploadIcon size={18} />
        {t('data.import')}
      </Label>
      <Input
        id="import-json"
        type="file"
        accept="application/json"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
        }}
      />
      {result ? (
        <p role="status" className="text-sm text-acc-ink">
          {t('data.importDone', { created: result.created })}
        </p>
      ) : null}
      {result && result.failed.length > 0 ? (
        <p role="status" className="text-sm text-warn">
          {t('data.importFailed', { failed: result.failed.length })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-warn">
          {t('data.importError')}
        </p>
      ) : null}
    </div>
  )
}
