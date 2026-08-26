// scripts/seed.ts — se ejecuta al arrancar el contenedor, después de migrar.
// Todo el seed es idempotente: upsert por clave natural, se puede correr N veces.
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import path from 'node:path'
import { Pool } from 'pg'
import type { Db } from '@/db/types'
import * as schema from '@/db/schema'
import { UNIT_ALIASES } from '@/lib/domain/units-data'
import tagsSeed from '@/db/seed/tags.json'

type TagSeed = { slug: string; name: { es: string; en: string }; parent: string | null }

export async function seedUnitAliases(db: Db): Promise<number> {
  const rows = UNIT_ALIASES.map((u) => ({ alias: u.alias, locale: u.locale, unit: u.unit, factorToBase: u.factorToBase }))
  await db
    .insert(schema.unitAliases)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.unitAliases.alias, schema.unitAliases.locale],
      set: { unit: sql`excluded.unit`, factorToBase: sql`excluded.factor_to_base` },
    })
  return rows.length
}

export async function seedTags(db: Db): Promise<number> {
  const list = tagsSeed as TagSeed[]
  const idBySlug = new Map<string, string>()
  // Padres primero (parent null), luego hijos; dos pasadas bastan porque la jerarquía tiene dos niveles
  for (const pass of [0, 1]) {
    for (const t of list) {
      if ((t.parent === null) !== (pass === 0)) continue
      const parentId = t.parent ? (idBySlug.get(t.parent) ?? null) : null
      const [row] = await db
        .insert(schema.tags)
        .values({ householdId: null, slug: t.slug, name: t.name.es, parentId })
        .onConflictDoUpdate({ target: [schema.tags.householdId, schema.tags.slug], set: { name: t.name.es, parentId } })
        .returning({ id: schema.tags.id })
      if (row) idBySlug.set(t.slug, row.id)
    }
  }
  return list.length
}

// Se implementa en la Tarea 7
export async function seedFoods(db: Db): Promise<number> {
  void db
  return 0
}

export async function seedAll(db: Db): Promise<{ units: number; tags: number; foods: number }> {
  const units = await seedUnitAliases(db)
  const tags = await seedTags(db)
  const foods = await seedFoods(db)
  return { units, tags, foods }
}

const argv1 = process.argv[1]
const isDirectRun = argv1 !== undefined && path.basename(argv1).replace(/\.(ts|js|mjs|cjs)$/, '') === 'seed'

if (isDirectRun) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: url })
  seedAll(drizzle(pool, { schema }) as Db)
    .then((r) => console.log(`seed: ${r.units} unidades, ${r.tags} etiquetas, ${r.foods} alimentos`))
    .catch((err: unknown) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => pool.end())
}
