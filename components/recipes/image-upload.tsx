'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PhotoIcon, TrashIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { uploadImageAction } from '@/lib/actions/recipes'

export interface ImageUploadProps {
  images: string[]
  onChange: (images: string[]) => void
}

// Sube al mismo volumen que POST /api/v1/uploads pero por una server action
// propia (uploadImageAction en lib/actions/recipes.ts): esa ruta REST exige
// un token de API que el navegador no tiene en una sesión de cookie normal.
export function ImageUpload({ images, onChange }: ImageUploadProps) {
  const t = useTranslations('recipes')
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const result = await uploadImageAction(formData)
      if (result.ok) {
        onChange([...images, result.data.url])
      } else {
        setError(t('editor.uploadError'))
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {images.map((url, index) => (
          <div key={url} className="relative">
            {/* Servida desde el volumen local (mismo origen): sin next/image, igual que recipe-detail.tsx. */}
            {/* Auditoría W7, 1.6: aquí SÍ hace falta alt con texto — es la
                miniatura de la foto recién subida, sin título al lado que
                haga de alternativa. Único caso de la W7-R1 con clave i18n
                nueva (editor.imageAlt). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={t('editor.imageAlt')} loading="lazy" decoding="async" className="size-20 rounded-md object-cover" />
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              aria-label={t('editor.removeImage')}
              className="absolute -top-1.5 -right-1.5 min-w-6 rounded-full"
              onClick={() => onChange(images.filter((_, i) => i !== index))}
            >
              <TrashIcon size={12} />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" aria-busy={uploading} disabled={uploading} onClick={() => inputRef.current?.click()}>
          <PhotoIcon size={18} />
          {t('editor.addImage')}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
