// Test de resolución de locale (cookie > Accept-Language > es) y fusión de namespaces.
import { describe, expect, it } from 'vitest'
import { loadMessages, resolveLocale } from './messages'

describe('resolveLocale', () => {
  it('prefiere la cookie', () => expect(resolveLocale('en', 'es-ES,es;q=0.9')).toBe('en'))
  it('cae a Accept-Language', () => expect(resolveLocale(undefined, 'en-GB,en;q=0.8')).toBe('en'))
  it('cae a es', () => expect(resolveLocale(undefined, 'fr-FR')).toBe('es'))
})

describe('loadMessages', () => {
  it('fusiona todos los namespaces', async () => {
    const m = await loadMessages('es')
    expect(Object.keys(m).sort()).toEqual(['auth', 'common', 'cook', 'errors', 'pantry', 'plan', 'recipes', 'settings', 'today'])
    expect(m.common.appName).toBe('RezetApp')
  })
})
