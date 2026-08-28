'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/actions/result'
import { ACCENTS, LOCALES, THEMES, type Accent, type Locale, type Theme } from '@/lib/prefs'
import { UnitSystemSchema } from '@/lib/validation/common'
import type { UserPrefsSchema } from '@/lib/validation/household'

export type UnitSystem = z.infer<typeof UnitSystemSchema>
const UNIT_SYSTEMS = UnitSystemSchema.options

export interface AppearancePrefs {
  displayName: string
  theme: Theme
  accent: Accent
  locale: Locale
  units: UnitSystem
}

export type PrefsPatch = z.infer<typeof UserPrefsSchema>
export type UpdatePrefsFn = (input: PrefsPatch) => Promise<ActionResult<null>>

// Cada control guarda su propio campo al vuelo (sin botón "Guardar" salvo
// para el nombre, que se escribe letra a letra): así el cambio de tema o
// acento se ve al instante y no hace falta un formulario con submit único.
export function AppearanceForm({ initial, updateAction }: { initial: AppearancePrefs; updateAction: UpdatePrefsFn }) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const [prefs, setPrefs] = useState(initial)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()

  // Aplica el patch de forma optimista y lo revierte si el servidor rechaza
  // el cambio: el control no debe quedarse mostrando un valor que no se guardó.
  function save(next: AppearancePrefs, patch: PrefsPatch) {
    const previous = prefs
    setPrefs(next)
    setError(false)
    setSaved(false)
    startTransition(async () => {
      const res = await updateAction(patch)
      if (res.ok) {
        setSaved(true)
      } else {
        setError(true)
        setPrefs(previous)
        if ('displayName' in patch) setDisplayName(previous.displayName)
      }
    })
  }

  function onTheme(theme: Theme) {
    save({ ...prefs, theme }, { theme })
  }

  function onAccent(accent: Accent) {
    save({ ...prefs, accent }, { accent })
  }

  function onUnits(units: UnitSystem) {
    save({ ...prefs, units }, { units })
  }

  function onLocale(locale: Locale) {
    save({ ...prefs, locale }, { locale })
  }

  function onSubmitName(e: FormEvent) {
    e.preventDefault()
    const name = displayName.trim()
    if (!name) return
    save({ ...prefs, displayName: name }, { displayName: name })
  }

  return (
    <Card className="flex flex-col gap-6 p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('appearance.theme')}</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((theme) => (
            <Button
              key={theme}
              type="button"
              variant={prefs.theme === theme ? 'default' : 'outline'}
              aria-pressed={prefs.theme === theme}
              onClick={() => onTheme(theme)}
            >
              {t(`appearance.themes.${theme}`)}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('appearance.accent')}</span>
        <div role="radiogroup" aria-label={t('appearance.accent')} className="flex flex-wrap gap-2">
          {ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              role="radio"
              aria-checked={prefs.accent === accent}
              aria-label={t(`appearance.accents.${accent}`)}
              data-accent={accent}
              onClick={() => onAccent(accent)}
              className={`accent-swatch size-11 rounded-pill transition-shadow ${prefs.accent === accent ? 'ring-2 ring-offset-2 ring-ring ring-offset-background' : ''}`}
            />
          ))}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('appearance.units')}</legend>
        <div className="flex gap-2">
          {UNIT_SYSTEMS.map((units) => (
            <Button
              key={units}
              type="button"
              variant={prefs.units === units ? 'default' : 'outline'}
              aria-pressed={prefs.units === units}
              onClick={() => onUnits(units)}
            >
              {t(units === 'metric' ? 'appearance.unitsMetric' : 'appearance.unitsImperial')}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('appearance.language')}</legend>
        <div className="flex gap-2">
          {LOCALES.map((locale) => (
            <Button
              key={locale}
              type="button"
              variant={prefs.locale === locale ? 'default' : 'outline'}
              aria-pressed={prefs.locale === locale}
              onClick={() => onLocale(locale)}
            >
              {t(`appearance.languages.${locale}`)}
            </Button>
          ))}
        </div>
      </fieldset>

      <form onSubmit={onSubmitName} className="flex flex-col gap-2">
        <Label htmlFor="display-name">{t('appearance.displayName')}</Label>
        <div className="flex gap-2">
          <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
          <Button type="submit" aria-busy={pending} disabled={pending || !displayName.trim() || displayName === prefs.displayName}>
            {c('actions.save')}
          </Button>
        </div>
      </form>

      {saved && !pending && (
        <p role="status" className="text-sm text-text-2">
          {t('appearance.saved')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {t('appearance.error')}
        </p>
      )}
    </Card>
  )
}
