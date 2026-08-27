'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { UploadIcon } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { importRecipesAction } from '@/lib/actions/recipes'
import { actionErrorKey } from '@/lib/actions/result'
import { MAX_IMPORT_BYTES } from '@/lib/validation/data'

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
// fichero que no es JSON, o que pesa más de la cuenta, se corta aquí, sin
// gastar un viaje al servidor (que repite igualmente la comprobación de
// tamaño: esta acción también es alcanzable sin pasar por este componente).
export function ImportButton() {
  const t = useTranslations('settings')
  const te = useTranslations('errors')
  const [result, setResult] = useState<{ created: number; failed: string[] } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setResult(null)
    setErrorMessage(null)
    setBusy(true)
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setErrorMessage(te('too_large'))
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(await readFileAsText(file))
      } catch {
        setErrorMessage(t('data.importError'))
        return
      }
      const res = await importRecipesAction(parsed)
      if (res.ok) {
        setResult(res.data)
        return
      }
      // Regla I3: nunca se pinta res.message (texto crudo); se traduce por
      // código. 'validation' conserva su copia propia de settings (el fichero
      // no es un volcado de RezetApp); el resto usa el namespace 'errors'
      // (mismo patrón que components/recipes/import-form.tsx).
      setErrorMessage(res.code === 'validation' ? t('data.importError') : te(actionErrorKey(res.code)))
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
      {errorMessage ? (
        <p role="alert" className="text-sm text-warn">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
