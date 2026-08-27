import { describe, expect, it } from 'vitest'
import { displayTagName } from './tags'

describe('displayTagName', () => {
  it('devuelve el español en es y el inglés en en', () => {
    const tag = { name: 'Postre', nameEn: 'Dessert' }
    expect(displayTagName(tag, 'es')).toBe('Postre')
    expect(displayTagName(tag, 'en')).toBe('Dessert')
  })
  it('sin traducción cae al español también en en', () => {
    expect(displayTagName({ name: 'Cena de los martes', nameEn: null }, 'en')).toBe('Cena de los martes')
    expect(displayTagName({ name: 'Cena de los martes', nameEn: '' }, 'en')).toBe('Cena de los martes')
  })
})

import { buildTagTree, descendantSlugs, type TagNodeInput } from './tags'

const tag = (id: string, slug: string, parentId: string | null = null): TagNodeInput => ({ id, name: slug, nameEn: null, slug, parentId })

const TAGS: TagNodeInput[] = [
  tag('1', 'dieta'),
  tag('2', 'vegetariano', '1'),
  tag('3', 'vegano', '1'),
  tag('4', 'rapido'),
  tag('5', 'crudivegano', '3'),
]

describe('buildTagTree', () => {
  it('anida por parentId y deja las raíces arriba, en el orden de entrada', () => {
    const tree = buildTagTree(TAGS)
    expect(tree.map((n) => n.slug)).toEqual(['dieta', 'rapido'])
    expect(tree[0]?.children.map((n) => n.slug)).toEqual(['vegetariano', 'vegano'])
    expect(tree[0]?.children[1]?.children.map((n) => n.slug)).toEqual(['crudivegano'])
  })

  it('un padre que no está en la lista deja al hijo como raíz en vez de perderlo', () => {
    const tree = buildTagTree([tag('9', 'huerfana', 'no-existe')])
    expect(tree.map((n) => n.slug)).toEqual(['huerfana'])
  })

  it('un ciclo en los datos no cuelga el proceso', () => {
    const a = tag('a', 'a', 'b')
    const b = tag('b', 'b', 'a')
    expect(() => buildTagTree([a, b])).not.toThrow()
    expect(buildTagTree([a, b])).toEqual([])
  })
})

describe('descendantSlugs', () => {
  it('devuelve el propio slug y toda su descendencia', () => {
    expect(descendantSlugs(TAGS, 'dieta').sort()).toEqual(['crudivegano', 'dieta', 'vegano', 'vegetariano'])
    expect(descendantSlugs(TAGS, 'vegano').sort()).toEqual(['crudivegano', 'vegano'])
    expect(descendantSlugs(TAGS, 'rapido')).toEqual(['rapido'])
  })

  it('un slug que no existe se devuelve tal cual (una etiqueta del hogar sin árbol)', () => {
    expect(descendantSlugs(TAGS, 'inventada')).toEqual(['inventada'])
  })
})
