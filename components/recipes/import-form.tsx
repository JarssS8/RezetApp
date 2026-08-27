'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { importRecipeAction } from '@/lib/actions/recipes'
import { actionErrorKey } from '@/lib/actions/result'

// Misma clave que lee components/recipes/recipe-editor.tsx en /recipes/new?draft=1
// (Tarea 12: importar por URL/texto deja aquí el borrador antes de navegar).
const DRAFT_KEY = 'rz.recipeDraft'

type ImportKind = 'url' | 'text'

// Todos los códigos que puede devolver lib/services/recipe-import.ts, con su
// traducción en recipes.import.warnings.*; un código fuera de esta lista no
// debería llegar nunca (cubre exactamente los `warnings.push(...)` del
// servicio), así que no hace falta un texto de reserva sin traducir.
const WARNING_KEYS = ['no_recipe_found', 'no_ingredients', 'no_steps', 'fetch_failed', 'empty', 'invalid_url', 'body_too_large'] as const
type WarningKey = (typeof WARNING_KEYS)[number]

function isWarningKey(w: string): w is WarningKey {
  return (WARNING_KEYS as readonly string[]).includes(w)
}

// Formulario de /recipes/import: dos pestañas (URL/texto) sobre la misma
// importRecipeAction que usa el MCP (docs/05-MCP.md); al conseguir un
// borrador lo deja en sessionStorage y navega al editor en blanco con
// ?draft=1, que lo recoge (components/recipes/recipe-editor.tsx).
export function ImportForm() {
  const t = useTranslations('recipes')
  const te = useTranslations('errors')
  const router = useRouter()

  const [kind, setKind] = useState<ImportKind>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setWarnings([])
    setSubmitting(true)
    try {
      const input = kind === 'url' ? { kind: 'url' as const, url: url.trim() } : { kind: 'text' as const, text: text.trim() }
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
      <div role="group" aria-label={t('import.title')} className="flex gap-1">
        <Button type="button" size="sm" variant={kind === 'url' ? 'secondary' : 'outline'} aria-pressed={kind === 'url'} onClick={() => setKind('url')}>
          {t('import.fromUrl')}
        </Button>
        <Button type="button" size="sm" variant={kind === 'text' ? 'secondary' : 'outline'} aria-pressed={kind === 'text'} onClick={() => setKind('text')}>
          {t('import.fromText')}
        </Button>
      </div>

      {kind === 'url' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-url">{t('import.url')}</Label>
          <Input id="import-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-text">{t('import.text')}</Label>
          <Textarea id="import-text" value={text} onChange={(e) => setText(e.target.value)} required rows={10} />
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
        {t('import.submit')}
      </Button>
    </form>
  )
}
