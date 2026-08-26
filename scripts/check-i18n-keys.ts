// Falla si es/ y en/ no tienen exactamente las mismas claves (recursivo).
import { readFileSync } from 'node:fs'
import { NAMESPACES } from '../lib/i18n/config'

type Tree = { [k: string]: string | Tree }

function keys(t: Tree, prefix = ''): string[] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)))
}

let failed = false
for (const ns of NAMESPACES) {
  const es = keys(JSON.parse(readFileSync(`messages/es/${ns}.json`, 'utf8')) as Tree).sort()
  const en = keys(JSON.parse(readFileSync(`messages/en/${ns}.json`, 'utf8')) as Tree).sort()
  const onlyEs = es.filter((k) => !en.includes(k))
  const onlyEn = en.filter((k) => !es.includes(k))
  if (onlyEs.length || onlyEn.length) {
    failed = true
    console.error(`[${ns}] solo en es: ${onlyEs.join(', ') || '-'} | solo en en: ${onlyEn.join(', ') || '-'}`)
  }
}
if (failed) process.exit(1)
console.log('i18n: claves iguales en es y en')
