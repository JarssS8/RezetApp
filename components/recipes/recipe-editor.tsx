'use client'

import type { FormEvent, KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CloseIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createRecipeAction, prepareIngredientsAction, updateRecipeAction, type PreparedIngredient } from '@/lib/actions/recipes'
import type { Locale } from '@/lib/domain/types'
import type { RecipeInput } from '@/lib/validation/recipes'
import { RecipeInputSchema } from '@/lib/validation/recipes'
import { IngredientLineEditor, type EditableIngredientLine } from './ingredient-line-editor'
import { ImageUpload } from './image-upload'
import { ServingsStepper } from './servings-stepper'

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTIES)[number]
type RecipeIngredientInput = RecipeInput['ingredients'][number]

// Clave de sessionStorage donde la pista (b) deja el borrador de una receta
// reconocida por foto/URL (Tarea 12): esta pantalla solo lo lee con ?draft=1.
const DRAFT_KEY = 'rz.recipeDraft'
const REPARSE_DEBOUNCE_MS = 400

// rows: una entrada por línea no vacía del textarea de ingredientes, en el
// mismo orden. `key` es solo para React (no viaja al servidor): sortOrder ya
// cumple ese papel en el envío.
type Row = EditableIngredientLine & { key: string }

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

function rowFromPrepared(p: PreparedIngredient, touched: boolean): Row {
  return { ...p, touched, key: newKey() }
}

function blankRow(rawText: string, sortOrder: number): Row {
  return {
    rawText,
    foodId: null,
    foodName: null,
    quantity: null,
    unit: null,
    displayQuantity: null,
    displayUnit: null,
    preparation: null,
    groupLabel: null,
    stepIndex: null,
    scalesLinearly: true,
    sortOrder,
    needsReview: true,
    touched: false,
    key: newKey(),
  }
}

// Filas ya resueltas (al editar una receta existente, o al cargar un
// borrador): se marcan `touched` para que el primer reanálisis no las pise
// -ya tienen alimento y unidades asignados-, salvo que su rawText cambie.
// `foodNames`, alineado por índice, solo lo trae la edición (initialFoodNames,
// que saca la página de RecipeDetail): un borrador de sessionStorage no tiene
// esa información y la línea muestra la conjetura de parseIngredientLine.
function rowsFromInput(ingredients: RecipeInput['ingredients'], foodNames?: (string | null)[]): Row[] {
  return ingredients.map((i, index) => ({
    rawText: i.rawText,
    foodId: i.foodId ?? null,
    foodName: foodNames?.[index] ?? null,
    quantity: i.quantity ?? null,
    unit: i.unit ?? null,
    displayQuantity: i.displayQuantity ?? null,
    displayUnit: i.displayUnit ?? null,
    preparation: i.preparation ?? null,
    groupLabel: i.groupLabel ?? null,
    stepIndex: i.stepIndex ?? null,
    // Undefined solo puede llegar de un borrador de IA (lib/validation/recipes.ts ya
    // no le pone default): se muestra como lineal hasta que el usuario lo corrija o
    // el reanálisis del servidor lo recalcule; una receta ya guardada siempre trae
    // un booleano real aquí (recipe-mapper.ts::detailToInput).
    scalesLinearly: i.scalesLinearly ?? true,
    sortOrder: index,
    needsReview: (i.foodId ?? null) === null,
    touched: true,
    key: newKey(),
  }))
}

// Regla W2-R18: el navegador nunca convierte unidades. Una línea `touched`
// (el usuario la corrigió a mano: FoodPicker, cantidad, unidad o el switch)
// nunca lleva quantity/unit -aunque los tuviera de un análisis anterior,
// pueden haber quedado obsoletos-, así que se omiten a propósito para que el
// servidor (prepareIngredientsWithFoods) los recalcule con la conversión real
// del alimento. Una línea sin tocar (la dejó tal cual el último análisis del
// servidor, o viene de una receta ya guardada sin re-corregir) sí los lleva,
// para no perder una conversión ya buena. El resto de campos solo se manda
// si tienen valor -nunca `undefined` explícito, exactOptionalPropertyTypes-.
export function buildIngredientInput(line: EditableIngredientLine): RecipeIngredientInput {
  return {
    rawText: line.rawText,
    scalesLinearly: line.scalesLinearly,
    stepIndex: null,
    ...(line.foodId !== null && { foodId: line.foodId }),
    ...(line.displayQuantity !== null && { displayQuantity: line.displayQuantity }),
    ...(line.displayUnit !== null && { displayUnit: line.displayUnit }),
    ...(line.preparation !== null && { preparation: line.preparation }),
    ...(line.groupLabel !== null && { groupLabel: line.groupLabel }),
    ...(!line.touched && line.quantity !== null && { quantity: line.quantity }),
    ...(!line.touched && line.unit !== null && { unit: line.unit }),
  }
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

// Los pasos se separan por línea en blanco (no por línea suelta): así un
// paso puede ocupar varias líneas y sobrevive a una reedición. Al precargar
// el textarea desde `steps` (initial/borrador) se une con '\n\n', el inverso.
function stepsFromText(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
}

export interface RecipeEditorProps {
  initial?: RecipeInput
  recipeId?: string
  locale: Locale
  // ?draft=1 en /recipes/new: lee el borrador que deja la Tarea 12 (importar
  // por foto/URL) en sessionStorage en vez de arrancar en blanco.
  useDraft?: boolean
  // Nombres reales (ya resueltos) de los alimentos de `initial.ingredients`,
  // alineados por índice. RecipeInput/detailToInput no los llevan -
  // RecipeIngredientInputSchema es estricto y no admite el campo-, así que
  // la página de edición los saca aparte de RecipeDetail (que sí trae el
  // alimento completo) y los pasa por aquí para no mostrar la conjetura de
  // parseIngredientLine en una línea que ya tiene alimento asignado.
  initialFoodNames?: (string | null)[]
}

// Borrador de la Tarea 12 (importar por foto/URL) en sessionStorage. Se lee
// una sola vez, como inicializador perezoso de useState (nunca en un efecto:
// no es sincronizar con un sistema externo que cambia, es la carga inicial
// de la pantalla) y protegido con `typeof window` porque este componente de
// cliente también se renderiza en el servidor durante el primer HTML.
function readDraft(): RecipeInput | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = RecipeInputSchema.safeParse(JSON.parse(raw) as unknown)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function RecipeEditor({ initial, recipeId, locale, useDraft, initialFoodNames }: RecipeEditorProps) {
  const t = useTranslations('recipes')
  const router = useRouter()

  // `initial` (editar) manda; si no hay y se pidió ?draft=1, se usa el
  // borrador de sessionStorage; si tampoco hay, la pantalla arranca en blanco.
  const [resolved] = useState<RecipeInput | undefined>(() => initial ?? (useDraft ? (readDraft() ?? undefined) : undefined))
  // initialFoodNames solo es válido si `resolved` es realmente `initial` (editar):
  // un borrador de sessionStorage no tiene esos nombres, y sus índices no
  // coinciden necesariamente con los de `initial`.
  const foodNamesForRows = resolved === initial ? initialFoodNames : undefined

  const [title, setTitle] = useState(resolved?.title ?? '')
  const [description, setDescription] = useState(resolved?.description ?? '')
  const [servingsBase, setServingsBase] = useState(resolved?.servingsBase ?? 2)
  const [prepMinutes, setPrepMinutes] = useState(resolved?.prepMinutes != null ? String(resolved.prepMinutes) : '')
  const [cookMinutes, setCookMinutes] = useState(resolved?.cookMinutes != null ? String(resolved.cookMinutes) : '')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(resolved?.difficulty ?? '')
  const [images, setImages] = useState<string[]>(resolved?.imageUrls ?? [])
  const [tags, setTags] = useState<string[]>(resolved?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [ingredientsText, setIngredientsText] = useState(resolved ? resolved.ingredients.map((i) => i.rawText).join('\n') : '')
  const [rows, setRows] = useState<Row[]>(resolved ? rowsFromInput(resolved.ingredients, foodNamesForRows) : [])
  const [stepsText, setStepsText] = useState(resolved ? resolved.steps.map((s) => s.text).join('\n\n') : '')
  const [notes, setNotes] = useState(resolved?.notes ?? '')
  // Campos que este editor no expone en un campo propio pero hay que
  // conservar al reeditar (por ejemplo la URL de origen de una receta
  // importada): no desaparecen solo porque esta pantalla no los muestra.
  const [sourceUrl] = useState<string | null>(resolved?.sourceUrl ?? null)
  const [yieldGrams] = useState<number | null>(resolved?.yieldGrams ?? null)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const rowsRef = useRef(rows)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Reanaliza el texto de ingredientes: una línea que el usuario ya corrigió
  // a mano (touched) en la misma posición y con el mismo texto se conserva
  // tal cual -no se le pisa el alimento o la unidad que acaba de fijar-;
  // el resto pasa por prepareIngredientsAction (mismo parser que usa el
  // servidor al guardar). Si la llamada falla, NO se tocan las filas -nunca
  // se deja en blanco un alimento ya resuelto por un fallo de red ajeno a esa
  // línea- y se devuelve false; handleSubmit corta el guardado en ese caso.
  // rowsRef se actualiza aquí mismo (no solo por el efecto de `rows`) para
  // que handleSubmit pueda leer el resultado justo después de esperar esta
  // función, sin esperar al siguiente render.
  async function reparse(text: string): Promise<boolean> {
    const rawLines = nonEmptyLines(text)
    setParsing(true)
    try {
      const current = rowsRef.current
      const kept = rawLines.map((raw, index) => {
        const existing = current[index]
        return existing && existing.touched && existing.rawText === raw ? existing : null
      })
      const pendingIndexes = kept.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0)

      let parsedResults: PreparedIngredient[] = []
      if (pendingIndexes.length) {
        const result = await prepareIngredientsAction(pendingIndexes.map((i) => ({ rawText: rawLines[i] as string })))
        if (!result.ok) {
          setError(t('editor.parseError'))
          return false
        }
        parsedResults = result.data
      }

      const merged = rawLines.map((raw, index) => {
        const existing = kept[index]
        if (existing) return { ...existing, sortOrder: index }
        const pos = pendingIndexes.indexOf(index)
        const parsed = pos >= 0 ? parsedResults[pos] : undefined
        if (parsed) return { ...rowFromPrepared(parsed, false), sortOrder: index }
        // No debería faltar un resultado con la petición ya resuelta con
        // éxito, pero por si acaso: se conserva la fila anterior en esa
        // posición antes que dejarla en blanco.
        const previous = current[index]
        return previous ? { ...previous, sortOrder: index } : blankRow(raw, index)
      })
      rowsRef.current = merged
      setRows(merged)
      return true
    } finally {
      setParsing(false)
    }
  }

  function scheduleReparse(text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void reparse(text)
    }, REPARSE_DEBOUNCE_MS)
  }

  function updateRow(index: number, next: EditableIngredientLine) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...next, key: r.key } : r)))
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index)
    setRows(next)
    setIngredientsText(next.map((r) => r.rawText).join('\n'))
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const value = tagDraft.trim()
    if (value && !tags.includes(value)) setTags([...tags, value])
    setTagDraft('')
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setError(null)
    setSaving(true)
    try {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) {
        setError(t('editor.titleRequired'))
        return
      }
      // Fuerza un último reanálisis por si el usuario no llegó a perder el
      // foco del textarea: si falla, se corta aquí (reparse ya puso el error
      // y no tocó las filas existentes).
      const reparsedOk = await reparse(ingredientsText)
      if (!reparsedOk) return
      const finalRows = rowsRef.current
      const stepLines = stepsFromText(stepsText)
      if (finalRows.length === 0 && stepLines.length === 0) {
        setError(t('editor.needsContent'))
        return
      }
      const trimmedPrep = prepMinutes.trim()
      const prepValue = trimmedPrep ? Number(trimmedPrep) : null
      const trimmedCook = cookMinutes.trim()
      const cookValue = trimmedCook ? Number(trimmedCook) : null
      const trimmedDescription = description.trim()
      const trimmedNotes = notes.trim()

      const input: RecipeInput = {
        title: trimmedTitle,
        description: trimmedDescription ? trimmedDescription : null,
        servingsBase,
        prepMinutes: prepValue !== null && Number.isFinite(prepValue) ? prepValue : null,
        cookMinutes: cookValue !== null && Number.isFinite(cookValue) ? cookValue : null,
        difficulty: difficulty === '' ? null : difficulty,
        sourceUrl,
        imageUrls: images,
        notes: trimmedNotes ? trimmedNotes : null,
        yieldGrams,
        tags,
        ingredients: finalRows.map(buildIngredientInput),
        steps: stepLines.map((text) => ({ text, timerSeconds: null, imageUrl: null })),
      }

      const result = recipeId ? await updateRecipeAction(recipeId, input) : await createRecipeAction(input)
      if (!result.ok) {
        setError(result.message || t('editor.saveError'))
        return
      }
      // Borrador ya consumido: si queda en sessionStorage, la próxima vez que
      // se abra /recipes/new?draft=1 (por ejemplo tras volver atrás) no debe
      // repetir una receta ya guardada.
      if (typeof window !== 'undefined') sessionStorage.removeItem(DRAFT_KEY)
      toast.success(t('editor.saved'))
      router.push(`/recipes/${result.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} aria-busy={saving} className="flex flex-col gap-6 pb-24">
      <h1 className="font-display text-2xl">{recipeId ? t('editor.editTitle') : t('editor.newTitle')}</h1>

      {error ? (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-title">{t('editor.title')}</Label>
        <Input id="recipe-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-description">{t('editor.description')}</Label>
        <Textarea id="recipe-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('editor.servingsBase')}</span>
          <ServingsStepper value={servingsBase} onChange={setServingsBase} />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-prep">{t('editor.prepMinutes')}</Label>
            <Input
              id="recipe-prep"
              type="number"
              min={0}
              inputMode="numeric"
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-cook">{t('editor.cookMinutes')}</Label>
            <Input
              id="recipe-cook"
              type="number"
              min={0}
              inputMode="numeric"
              value={cookMinutes}
              onChange={(e) => setCookMinutes(e.target.value)}
              className="w-24"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('editor.difficulty')}</span>
        <div role="group" aria-label={t('editor.difficulty')} className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant={difficulty === '' ? 'secondary' : 'outline'} aria-pressed={difficulty === ''} onClick={() => setDifficulty('')}>
            {t('filters.any')}
          </Button>
          {DIFFICULTIES.map((d) => (
            <Button key={d} type="button" size="sm" variant={difficulty === d ? 'secondary' : 'outline'} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>
              {t(`filters.${d}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('editor.images')}</span>
        <ImageUpload images={images} onChange={setImages} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-tag-draft">{t('editor.tags')}</Label>
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <li key={tag} className="flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2">
                <span>{tag}</span>
                <button type="button" aria-label={t('editor.removeTag')} onClick={() => setTags(tags.filter((x) => x !== tag))}>
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          id="recipe-tag-draft"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder={t('editor.tagPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="recipe-ingredients">{t('editor.ingredients')}</Label>
          <Button type="button" variant="outline" size="sm" aria-busy={parsing} onClick={() => void reparse(ingredientsText)}>
            {t('editor.reparse')}
          </Button>
        </div>
        <Textarea
          id="recipe-ingredients"
          value={ingredientsText}
          onChange={(e) => {
            setIngredientsText(e.target.value)
            scheduleReparse(e.target.value)
          }}
          onBlur={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            void reparse(ingredientsText)
          }}
          placeholder={t('editor.ingredientsHint')}
          rows={5}
        />
        {rows.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <IngredientLineEditor key={row.key} line={row} locale={locale} onChange={(next) => updateRow(index, next)} onRemove={() => removeRow(index)} />
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-steps">{t('editor.steps')}</Label>
        <Textarea
          id="recipe-steps"
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          placeholder={t('editor.stepsHint')}
          rows={5}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-notes">{t('editor.notes')}</Label>
        <Textarea id="recipe-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3} />
      </div>

      <Button type="submit" aria-busy={saving} disabled={saving}>
        {t('editor.save')}
      </Button>
    </form>
  )
}
