import type { Locale } from './types'

// Etiqueta a mostrar: el nombre está en español (tags.name) y la traducción al
// inglés es opcional (tags.name_en, null en etiquetas propias del hogar).
// Sin traducción se enseña el español antes que un hueco (regla W1-R19).
export function displayTagName(tag: { name: string; nameEn: string | null }, locale: Locale): string {
  if (locale === 'en' && tag.nameEn) return tag.nameEn
  return tag.name
}

export interface TagNodeInput {
  id: string
  name: string
  nameEn: string | null
  slug: string
  parentId: string | null
}

export interface TagNode extends TagNodeInput {
  children: TagNode[]
}

// Árbol de etiquetas (tags.parent_id). El seed trae dos niveles, pero nada
// impide más: la recursión no asume profundidad.
// Un hijo cuyo padre no está en la lista sube a raíz en vez de desaparecer
// (una etiqueta del hogar puede colgar de una global que se filtró por otro
// motivo); un ciclo en los datos se descarta en vez de colgar el proceso.
export function buildTagTree(tags: TagNodeInput[]): TagNode[] {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const nodes = new Map<string, TagNode>(tags.map((t) => [t.id, { ...t, children: [] }]))
  const roots: TagNode[] = []
  for (const tag of tags) {
    const node = nodes.get(tag.id)
    if (!node) continue
    const parent = tag.parentId === null ? undefined : nodes.get(tag.parentId)
    if (!parent) {
      // Padre ausente (o sin padre): raíz. Pero si el padre existe en byId y no
      // en nodes es imposible; el caso real que queda es el ciclo, que se
      // detecta abajo.
      if (tag.parentId !== null && byId.has(tag.parentId)) continue
      roots.push(node)
      continue
    }
    if (hasAncestor(byId, parent.id, tag.id)) continue // ciclo: se descarta
    parent.children.push(node)
  }
  return roots
}

function hasAncestor(byId: Map<string, TagNodeInput>, startId: string, lookingFor: string): boolean {
  let current = byId.get(startId)
  let guard = 0
  while (current && guard < 64) {
    if (current.id === lookingFor) return true
    current = current.parentId === null ? undefined : byId.get(current.parentId)
    guard += 1
  }
  return guard >= 64
}

// El propio slug más el de toda su descendencia. Es lo que convierte "filtra
// por dieta" en "enséñame vegetarianas y veganas". Un slug desconocido se
// devuelve tal cual: puede ser una etiqueta suelta del hogar.
export function descendantSlugs(tags: TagNodeInput[], slug: string): string[] {
  const root = tags.find((t) => t.slug === slug)
  if (!root) return [slug]
  const out = [root.slug]
  const pending = [root.id]
  const seen = new Set<string>([root.id])
  while (pending.length > 0) {
    const id = pending.pop() as string
    for (const child of tags) {
      if (child.parentId !== id || seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child.slug)
      pending.push(child.id)
    }
  }
  return out
}
