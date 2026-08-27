'use client'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { actionErrorKey } from '@/lib/actions/result'
import { mergeFoodsAction, searchFoodsAction, type FoodSummary, type MergeFoodsResult } from '@/lib/actions/foods'

const DEBOUNCE_MS = 250
const MIN_CHARS = 2

interface FoodSearchFieldProps {
  label: string
  placeholder: string
  value: FoodSummary | null
  onChange: (food: FoodSummary | null) => void
}

// Buscador de un único alimento, con el mismo retardo/mínimo de caracteres
// que el combobox de FoodPicker (components/foods/food-picker.tsx), pero sin
// su ARIA de combobox: aquí basta una lista simple de resultados, porque cada
// instancia solo elige un alimento fijo para la fusión (sin "crear nuevo" ni
// código de barras).
function FoodSearchField({ label, placeholder, value, onChange }: FoodSearchFieldProps) {
  const id = useId()
  const [q, setQ] = useState(value?.name ?? '')
  const [items, setItems] = useState<FoodSummary[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Descarta respuestas de búsquedas obsoletas, igual que FoodPicker.
  const reqId = useRef(0)
  // El propio `select` cambia `q` a `food.name`: sin este cortafuegos ese
  // cambio dispararía una nueva búsqueda que reabriría la lista justo tras
  // elegir.
  const skipNextSearch = useRef(false)

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false
      return
    }
    if (timer.current) clearTimeout(timer.current)
    const query = q.trim()
    timer.current = setTimeout(() => {
      void (async () => {
        const currentId = ++reqId.current
        if (query.length < MIN_CHARS) {
          setItems([])
          return
        }
        const r = await searchFoodsAction(query)
        if (reqId.current !== currentId) return
        setItems(r.ok ? r.data : [])
      })()
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  function select(food: FoodSummary) {
    skipNextSearch.current = true
    onChange(food)
    setQ(food.name)
    setItems([])
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value)
          if (value) onChange(null)
        }}
      />
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md border border-border bg-card p-1 shadow-card">
          {items.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => select(food)}
                className="flex min-h-11 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-surface-2"
              >
                {food.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// Fusión de duplicados desde la despensa (Tarea 24): dos buscadores
// independientes -el duplicado que desaparece y el alimento que se queda-
// resueltos ambos con searchFoodsAction, y un botón que llama a
// mergeFoodsAction (Tarea 23). Bloqueado hasta elegir dos alimentos distintos.
export function MergeFoodsForm() {
  const t = useTranslations('pantry')
  const te = useTranslations('errors')

  const [from, setFrom] = useState<FoodSummary | null>(null)
  const [into, setInto] = useState<FoodSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MergeFoodsResult | null>(null)

  const canSubmit = from !== null && into !== null && from.id !== into.id

  async function handleSubmit() {
    if (!from || !into) return
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await mergeFoodsAction(from.id, into.id)
      if (!res.ok) {
        setError(te(actionErrorKey(res.code)))
        return
      }
      setResult(res.data)
      setFrom(null)
      setInto(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FoodSearchField label={t('merge.from')} placeholder={t('merge.search')} value={from} onChange={setFrom} />
      <FoodSearchField label={t('merge.into')} placeholder={t('merge.search')} value={into} onChange={setInto} />
      <Button type="button" aria-busy={saving} disabled={!canSubmit || saving} onClick={() => void handleSubmit()}>
        {t('merge.submit')}
      </Button>
      {result ? (
        <p role="status" className="text-sm text-text-2">
          {t('merge.done', { ingredients: result.ingredientsRepointed, items: result.pantryItemsRepointed })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-warn">
          {t('merge.error')}: {error}
        </p>
      ) : null}
    </div>
  )
}
