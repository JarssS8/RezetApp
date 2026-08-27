'use client'
import { useTranslations } from 'next-intl'
import type { KeyboardEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { BarcodeIcon, EstimatedIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { lookupBarcodeAction, searchFoodsAction, type FoodSummary } from '@/lib/actions/foods'
import type { Locale } from '@/lib/prefs'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 250
const MIN_CHARS = 2

function displayName(f: Pick<FoodSummary, 'nameEs' | 'nameEn'>, locale: Locale): string {
  return locale === 'en' ? f.nameEn : f.nameEs
}

export interface FoodPickerProps {
  value: FoodSummary | null
  onChange: (food: FoodSummary | null) => void
  locale: Locale
  onCreateNew?: (q: string) => void
  allowBarcode?: boolean
  className?: string
  // Texto inicial del combobox cuando no hay `value` (p. ej. el escáner de
  // códigos de barras, Task 16, llega con un nombre sugerido sin alimento resuelto).
  initialQuery?: string
}

// Combobox accesible (role=combobox + listbox) reutilizado por las pistas (a)
// y (d). Llama directamente a searchFoodsAction/lookupBarcodeAction (los tests
// sustituyen '@/lib/actions/foods' por un mock del módulo). Debounce 250 ms,
// mínimo 2 caracteres.
export function FoodPicker({ value, onChange, locale, onCreateNew, allowBarcode, className, initialQuery }: FoodPickerProps) {
  const t = useTranslations('recipes')
  const tc = useTranslations('common')
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const [q, setQ] = useState(value ? displayName(value, locale) : (initialQuery ?? ''))
  const [items, setItems] = useState<FoodSummary[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcodeValue, setBarcodeValue] = useState('')
  const [barcodeNotFound, setBarcodeNotFound] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Descarta respuestas de búsquedas obsoletas: si el usuario ya escribió otra
  // cosa, una respuesta lenta de la petición anterior no debe pisar la actual.
  const reqId = useRef(0)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const query = q.trim()
    timer.current = setTimeout(async () => {
      const id = ++reqId.current
      if (query.length < MIN_CHARS) {
        setItems([])
        setActiveIndex(-1)
        return
      }
      const r = await searchFoodsAction(query)
      if (reqId.current !== id) return // ya hay una búsqueda más reciente en curso: ignorar esta respuesta
      const found = r.ok ? r.data : []
      setItems(found)
      setOpen(true)
      setActiveIndex(0)
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  const trimmedQ = q.trim()
  const hasExactMatch = items.some((f) => displayName(f, locale).toLowerCase() === trimmedQ.toLowerCase())
  const showCreate = Boolean(onCreateNew) && trimmedQ.length >= MIN_CHARS && !hasExactMatch
  const optionCount = items.length + (showCreate ? 1 : 0)

  function selectItem(f: FoodSummary) {
    onChange(f)
    setQ(displayName(f, locale))
    setOpen(false)
    setActiveIndex(-1)
  }

  function selectCreate() {
    onCreateNew?.(trimmedQ)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.key === 'ArrowDown' && !open) {
      if (optionCount > 0) {
        e.preventDefault()
        setOpen(true)
        setActiveIndex(0)
      }
      return
    }
    if (!open || optionCount === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, optionCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < items.length) {
        const picked = items[activeIndex]
        if (picked) selectItem(picked)
      } else if (showCreate && activeIndex === items.length) {
        selectCreate()
      }
    }
  }

  async function submitBarcode() {
    const code = barcodeValue.trim()
    if (!code) return
    const r = await lookupBarcodeAction(code)
    if (r.ok && r.data) {
      onChange(r.data)
      setQ(displayName(r.data, locale))
      setBarcodeOpen(false)
      setBarcodeValue('')
      setBarcodeNotFound(false)
    } else {
      setBarcodeNotFound(true)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
            value={q}
            placeholder={t('food.searchPlaceholder')}
            onChange={(e) => {
              setQ(e.target.value)
              if (value) onChange(null)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => optionCount > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
          />
          {open && optionCount > 0 && (
            <ul id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-card">
              {items.map((f, i) => (
                <li
                  key={f.id}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={activeIndex === i}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm',
                    activeIndex === i ? 'bg-surface-2' : 'hover:bg-surface-2',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectItem(f)}
                >
                  <span>{displayName(f, locale)}</span>
                  <span className="flex items-center gap-1 text-xs text-text-2">
                    {f.householdId ? <span>{t('food.mine')}</span> : null}
                    {f.isEstimated ? <EstimatedIcon size={14} title={t('food.estimated')} /> : null}
                  </span>
                </li>
              ))}
              {showCreate ? (
                <li
                  id={`${listboxId}-opt-${items.length}`}
                  role="option"
                  aria-selected={activeIndex === items.length}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center px-3 text-sm text-acc-ink',
                    activeIndex === items.length ? 'bg-surface-2' : 'hover:bg-surface-2',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(items.length)}
                  onClick={selectCreate}
                >
                  <span>{t('food.createWithQuery', { q: trimmedQ })}</span>
                </li>
              ) : null}
            </ul>
          )}
        </div>
        {allowBarcode ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('food.scanBarcode')}
            aria-pressed={barcodeOpen}
            onClick={() => setBarcodeOpen((v) => !v)}
          >
            <BarcodeIcon size={18} />
          </Button>
        ) : null}
      </div>
      {allowBarcode && barcodeOpen ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={barcodeValue}
            placeholder={t('food.barcodePlaceholder')}
            onChange={(e) => {
              setBarcodeValue(e.target.value)
              setBarcodeNotFound(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitBarcode()
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={() => void submitBarcode()}>
            {tc('actions.confirm')}
          </Button>
        </div>
      ) : null}
      {allowBarcode && barcodeOpen && barcodeNotFound ? <p className="mt-1 text-xs text-warn">{t('food.barcodeNotFound')}</p> : null}
    </div>
  )
}
