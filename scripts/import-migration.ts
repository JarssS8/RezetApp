// Migración desde otra app (spec §17 W4(c)). Se ejecuta a mano, una vez:
//   pnpm import:mealie ./export.json --household <uuid> [--dry-run]
// Crea las recetas con createRecipe, el mismo servicio que la interfaz.
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/db'
import { mapMigration } from '@/lib/services/migrations'
import { createRecipe } from '@/lib/services/recipes'
import type { Ctx } from '@/lib/services/ctx'

export interface MigrationArgs {
  source: 'mealie' | 'tandoor'
  path: string
  householdId: string
  dryRun: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseMigrationArgs(source: 'mealie' | 'tandoor', argv: string[]): MigrationArgs {
  const path = argv[0]
  const householdIndex = argv.indexOf('--household')
  const householdId = householdIndex >= 0 ? argv[householdIndex + 1] : undefined
  if (!path || path.startsWith('--') || !householdId) {
    throw new Error(`Uso: pnpm import:${source} <fichero-o-directorio.json> --household <uuid> [--dry-run]`)
  }
  if (!UUID_RE.test(householdId)) throw new Error('El identificador de hogar debe ser un uuid')
  return { source, path, householdId, dryRun: argv.includes('--dry-run') }
}

// Mealie exporta un fichero por receta dentro de un directorio; Tandoor, una
// lista. Se aceptan las tres formas para no obligar a preprocesar nada.
export async function readRecipeFiles(path: string): Promise<unknown[]> {
  const info = await stat(path)
  if (info.isDirectory()) {
    const entries = (await readdir(path)).filter((name) => name.endsWith('.json')).sort()
    const out: unknown[] = []
    for (const name of entries) {
      try {
        out.push(JSON.parse(await readFile(join(path, name), 'utf8')))
      } catch (e) {
        // Con cientos de ficheros exportados, el error debe nombrar al culpable.
        throw new Error(`No se pudo leer ${name}: ${(e as Error).message}`)
      }
    }
    return out
  }
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  return Array.isArray(parsed) ? parsed : [parsed]
}

export async function runMigration(args: MigrationArgs): Promise<{ created: number; skipped: number }> {
  const items = await readRecipeFiles(args.path)
  const { recipes, skipped } = mapMigration(args.source, items)
  for (const s of skipped) console.warn(`omitida: ${s.title} (${s.reason})`)
  if (args.dryRun) {
    for (const r of recipes) console.log(`[dry-run] ${r.title} — ${r.ingredients.length} ingredientes, ${r.steps.length} pasos`)
    return { created: 0, skipped: skipped.length }
  }
  // Ctx de servicio sin sesión: el script actúa como el propio hogar. userId
  // null es válido en Ctx (es lo que usan los tokens de API) y createRecipe no
  // lo necesita.
  const ctx: Ctx = { db, householdId: args.householdId, userId: null, apiTokenId: null, role: null, locale: 'es', scopes: [] }
  let created = 0
  for (const recipe of recipes) {
    await createRecipe(ctx, recipe)
    created += 1
    console.log(`importada: ${recipe.title}`)
  }
  return { created, skipped: skipped.length }
}
