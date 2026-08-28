// Migración desde otra app (spec §17 W4(c)). Se ejecuta a mano, una vez:
//   pnpm import:mealie ./export.json --household <uuid> [--dry-run]
// Crea las recetas con createRecipe, el mismo servicio que la interfaz.
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/db'
import { mapMigration } from '@/lib/services/migrations'
import { createRecipe, searchRecipes } from '@/lib/services/recipes'
import type { Ctx } from '@/lib/services/ctx'

// Tipo tomado de la propia firma de createRecipe: importarlo directo de
// lib/validation violaría la frontera scripts -> services fijada en W4 Tarea 16
// (scripts solo puede depender de scripts, db, domain, lib y services).
type RecipeInput = Parameters<typeof createRecipe>[1]

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

// Inyectables para poder probar el bucle sin base de datos: en producción son
// createRecipe y una consulta paginada de títulos, en el test son dos dobles.
export interface MigrationDeps {
  create: (ctx: Ctx, input: RecipeInput) => Promise<unknown>
  existingTitles: (ctx: Ctx) => Promise<Set<string>>
}

export interface MigrationRunResult {
  created: number
  // No mapeadas (les faltaban ingredientes o pasos): las cuenta mapMigration.
  skipped: number
  // Ya estaban en el hogar: la migración es repetible sin duplicar.
  duplicated: number
  // Mapeadas bien pero que el servicio rechazó: la migración sigue con las demás.
  failed: string[]
}

// Comparación de títulos para deduplicar: minúsculas, sin acentos y con los
// espacios colapsados. No se reutiliza normalizeSearchName de lib/domain
// porque aquello normaliza *nombres de alimento* para el buscador y puede
// cambiar de reglas sin avisar a esto.
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function listExistingTitles(ctx: Ctx): Promise<Set<string>> {
  const titles = new Set<string>()
  const PAGE = 100 // el máximo que admite PaginationSchema
  for (let offset = 0; ; offset += PAGE) {
    const { items, total } = await searchRecipes(ctx, { limit: PAGE, offset, sort: 'title' })
    for (const item of items) titles.add(normalizeTitle(item.title))
    if (items.length === 0 || offset + items.length >= total) break
  }
  return titles
}

const defaultDeps: MigrationDeps = { create: createRecipe, existingTitles: listExistingTitles }

export async function runMigration(args: MigrationArgs, deps: MigrationDeps = defaultDeps): Promise<MigrationRunResult> {
  const items = await readRecipeFiles(args.path)
  const { recipes, skipped } = mapMigration(args.source, items)
  for (const s of skipped) console.warn(`omitida: ${s.title} (${s.reason})`)

  if (args.dryRun) {
    for (const r of recipes) console.log(`[dry-run] ${r.title} — ${r.ingredients.length} ingredientes, ${r.steps.length} pasos`)
    return { created: 0, skipped: skipped.length, duplicated: 0, failed: [] }
  }

  // Ctx de servicio sin sesión: el script actúa como el propio hogar. userId
  // null es válido en Ctx (es lo que usan los tokens de API) y createRecipe no
  // lo necesita.
  const ctx: Ctx = { db, householdId: args.householdId, userId: null, apiTokenId: null, role: null, locale: 'es', scopes: [] }
  const existing = await deps.existingTitles(ctx)

  let created = 0
  let duplicated = 0
  const failed: string[] = []
  for (const recipe of recipes) {
    const key = normalizeTitle(recipe.title)
    if (existing.has(key)) {
      duplicated += 1
      console.log(`ya estaba: ${recipe.title}`)
      continue
    }
    try {
      await deps.create(ctx, recipe)
      // Dentro del mismo fichero puede venir el mismo título dos veces.
      existing.add(key)
      created += 1
      console.log(`importada: ${recipe.title}`)
    } catch (e) {
      // Igual que importAll (lib/services/recipes.ts): una receta rota no
      // aborta la migración; se anota y se sigue con las demás.
      failed.push(recipe.title)
      console.error(`falló: ${recipe.title} — ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { created, skipped: skipped.length, duplicated, failed }
}
