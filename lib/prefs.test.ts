// Test de lib/prefs.ts: lectura y serialización de la cookie rz_prefs.
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, readPrefs, serializePrefs } from './prefs'

describe('readPrefs', () => {
  it('devuelve defaults si no hay cookie', () => {
    expect(readPrefs(undefined)).toEqual(DEFAULT_PREFS)
  })
  it('ignora JSON roto', () => {
    expect(readPrefs('{oops')).toEqual(DEFAULT_PREFS)
  })
  it('ignora valores fuera de rango y conserva los válidos', () => {
    expect(readPrefs(JSON.stringify({ theme: 'neon', accent: 'higo', locale: 'fr' }))).toEqual({
      ...DEFAULT_PREFS,
      accent: 'higo',
    })
  })
  it('serializa y vuelve a leer', () => {
    const p = { theme: 'dark', accent: 'miel', locale: 'en' } as const
    expect(readPrefs(serializePrefs(p))).toEqual(p)
  })
})
