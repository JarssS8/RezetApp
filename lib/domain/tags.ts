import type { Locale } from './types'

// Etiqueta a mostrar: el nombre está en español (tags.name) y la traducción al
// inglés es opcional (tags.name_en, null en etiquetas propias del hogar).
// Sin traducción se enseña el español antes que un hueco (regla W1-R19).
export function displayTagName(tag: { name: string; nameEn: string | null }, locale: Locale): string {
  if (locale === 'en' && tag.nameEn) return tag.nameEn
  return tag.name
}
