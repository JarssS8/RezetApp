'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { FoodPicker } from '@/components/foods/food-picker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { actionErrorKey } from '@/lib/actions/result'
import { mergeFoodsAction, type FoodSummary, type MergeFoodsResult } from '@/lib/actions/foods'

// Fusión de duplicados desde la despensa (Tarea 24): dos FoodPicker
// (components/foods/food-picker.tsx) -el duplicado que desaparece y el
// alimento que se queda- resueltos ambos con searchFoodsAction, y un botón
// que llama a mergeFoodsAction (Tarea 23). Reutiliza FoodPicker en vez de un
// buscador propio: ya trae combobox/listbox accesible, navegación por
// teclado y cierre al perder el foco. Bloqueado hasta elegir dos alimentos
// distintos.
export function MergeFoodsForm() {
  const t = useTranslations('pantry')
  const te = useTranslations('errors')
  const locale = useLocale()

  const [from, setFrom] = useState<FoodSummary | null>(null)
  const [into, setInto] = useState<FoodSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MergeFoodsResult | null>(null)
  // Cambia tras cada fusión con éxito para remontar los dos FoodPicker: es la
  // única forma de vaciar su texto interno, que no se resincroniza solo
  // porque `value` vuelva a null (no hay useEffect para eso en FoodPicker).
  const [resetKey, setResetKey] = useState(0)

  const sameFood = from !== null && into !== null && from.id === into.id
  const canSubmit = from !== null && into !== null && !sameFood

  async function handleSubmit() {
    if (!from || !into) return
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await mergeFoodsAction(from.id, into.id)
      if (!res.ok) {
        // 'conflict' aquí es siempre el mismo motivo (fix 1 de la revisión
        // final): el destino es global y el duplicado trae un alérgeno que no
        // tiene, así que un mensaje específico ahorra al usuario tener que
        // adivinarlo a partir del genérico.
        setError(res.code === 'conflict' ? t('merge.conflictAllergens') : te(actionErrorKey(res.code)))
        return
      }
      setResult(res.data)
      setFrom(null)
      setInto(null)
      setResetKey((k) => k + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div data-testid="merge-from" className="flex flex-col gap-2">
        <Label>{t('merge.from')}</Label>
        <FoodPicker key={`from-${resetKey}`} value={from} onChange={setFrom} locale={locale} />
      </div>
      <div data-testid="merge-into" className="flex flex-col gap-2">
        <Label>{t('merge.into')}</Label>
        <FoodPicker key={`into-${resetKey}`} value={into} onChange={setInto} locale={locale} />
      </div>
      {sameFood ? <p className="text-xs text-warn-ink">{t('merge.sameFood')}</p> : null}
      <Button type="button" aria-busy={saving} disabled={!canSubmit || saving} onClick={() => void handleSubmit()}>
        {t('merge.submit')}
      </Button>
      {result ? (
        <p role="status" className="text-sm text-text-2">
          {t('merge.done', { ingredients: result.ingredientsRepointed, items: result.pantryItemsRepointed })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {t('merge.error')}: {error}
        </p>
      ) : null}
    </div>
  )
}
