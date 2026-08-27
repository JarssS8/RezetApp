'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileIcon } from '@/components/icons'
import { importRecipeAction, uploadImageAction, uploadPdfAction } from '@/lib/actions/recipes'
import { actionErrorKey } from '@/lib/actions/result'

// Misma clave que lee components/recipes/recipe-editor.tsx en /recipes/new?draft=1
// (Tarea 12: importar por URL/texto deja aquí el borrador antes de navegar).
const DRAFT_KEY = 'rz.recipeDraft'

type ImportKind = 'url' | 'text' | 'image' | 'pdf'

const KIND_LABEL: Record<ImportKind, 'fromUrl' | 'fromText' | 'fromPhoto' | 'fromPdf'> = {
  url: 'fromUrl',
  text: 'fromText',
  image: 'fromPhoto',
  pdf: 'fromPdf',
}
const KIND_ORDER: ImportKind[] = ['url', 'text', 'image', 'pdf']

// Todos los códigos que puede devolver lib/services/recipe-import.ts, con su
// traducción en recipes.import.warnings.*; un código fuera de esta lista no
// debería llegar nunca (cubre exactamente los `warnings.push(...)` del
// servicio), así que no hace falta un texto de reserva sin traducir.
const WARNING_KEYS = [
  'no_recipe_found',
  'no_ingredients',
  'no_steps',
  'fetch_failed',
  'empty',
  'invalid_url',
  'body_too_large',
  'upload_not_found',
  'ai_no_provider',
  'ai_unsupported',
  'ai_budget',
  'ai_output',
] as const
type WarningKey = (typeof WARNING_KEYS)[number]

function isWarningKey(w: string): w is WarningKey {
  return (WARNING_KEYS as readonly string[]).includes(w)
}

// Formulario de /recipes/import: cuatro pestañas (URL/texto/foto/PDF) sobre la
// misma importRecipeAction que usa el MCP (docs/05-MCP.md). Foto y PDF suben
// primero el fichero (uploadImageAction/uploadPdfAction) y solo después piden
// la importación con el uploadId devuelto: el servicio lee el fichero ya
// guardado del hogar, así el mismo uploadId sirve para REST y para el MCP. Al
// conseguir un borrador lo deja en sessionStorage y navega al editor en
// blanco con ?draft=1, que lo recoge (components/recipes/recipe-editor.tsx).
export function ImportForm() {
  const t = useTranslations('recipes')
  const te = useTranslations('errors')
  const router = useRouter()

  const [kind, setKind] = useState<ImportKind>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setWarnings([])
    setSubmitting(true)
    try {
      let input: { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'image' | 'pdf'; uploadId: string }
      if (kind === 'url') {
        input = { kind: 'url', url: url.trim() }
      } else if (kind === 'text') {
        input = { kind: 'text', text: text.trim() }
      } else {
        if (!file) return
        const form = new FormData()
        form.set('file', file)
        const uploaded = kind === 'pdf' ? await uploadPdfAction(form) : await uploadImageAction(form)
        if (!uploaded.ok) {
          setError(te(actionErrorKey(uploaded.code)))
          return
        }
        input = { kind, uploadId: uploaded.data.uploadId }
      }
      const result = await importRecipeAction(input)
      if (!result.ok) {
        setError(te(actionErrorKey(result.code)))
        return
      }
      // El borrador se guarda sin `warnings`: RecipeInputSchema es estricto y
      // el editor (recipe-editor.tsx) lo valida con ese esquema al leerlo.
      const { warnings: draftWarnings, ...draftInput } = result.data
      setWarnings(draftWarnings)
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftInput))
      router.push('/recipes/new?draft=1')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} aria-busy={submitting} className="flex flex-col gap-4">
      <div role="group" aria-label={t('import.title')} className="flex flex-wrap gap-1">
        {KIND_ORDER.map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? 'secondary' : 'outline'}
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              // Sin esto, un fichero elegido en "foto" quedaría en el estado
              // y se enviaría por error bajo la pestaña "PDF" (o viceversa).
              setFile(null)
            }}
          >
            {t(`import.${KIND_LABEL[k]}`)}
          </Button>
        ))}
      </div>

      {kind === 'url' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-url">{t('import.url')}</Label>
          <Input id="import-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
      ) : kind === 'text' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-text">{t('import.text')}</Label>
          <Textarea id="import-text" value={text} onChange={(e) => setText(e.target.value)} required rows={10} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-file" className="flex items-center gap-1.5">
            {kind === 'pdf' ? <FileIcon size={18} /> : null}
            {t('import.file')}
          </Label>
          {/* Sin `required` nativo: la comprobación vive en handleSubmit
              (`if (!file) return`) porque jsdom no calcula bien la validez de
              un input[type=file] con ficheros asignados por script (siempre
              reporta valueMissing), lo que bloquearía el evento submit del
              formulario entero en los tests. */}
          <Input
            id="import-file"
            type="file"
            accept={kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/avif'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <ul role="status" className="flex flex-col gap-1 text-sm text-warn">
          {warnings.filter(isWarningKey).map((w) => (
            <li key={w}>{t(`import.warnings.${w}`)}</li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" aria-busy={submitting} disabled={submitting}>
        {submitting && (kind === 'image' || kind === 'pdf') ? t('import.uploading') : t('import.submit')}
      </Button>
    </form>
  )
}
