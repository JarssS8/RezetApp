// scripts/seed.ts — se ejecuta al arrancar el contenedor, después de migrar.
// Todo el seed es idempotente: upsert por clave natural, se puede correr N veces.
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import path from 'node:path'
import { Pool } from 'pg'
import type { Db } from '@/db/types'
import * as schema from '@/db/schema'
import { normalizeSearchName } from '@/lib/domain/quantities'
import { UNIT_ALIASES } from '@/lib/domain/units-data'
import foodsSeed from '@/db/seed/foods.json'
import tagsSeed from '@/db/seed/tags.json'
import type { FoodSeed } from './build-foods-seed'

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
        .values({ householdId: null, slug: t.slug, name: t.name.es, nameEn: t.name.en, parentId })
        .onConflictDoUpdate({ target: [schema.tags.householdId, schema.tags.slug], set: { name: t.name.es, nameEn: t.name.en, parentId } })
        .returning({ id: schema.tags.id })
      if (row) idBySlug.set(t.slug, row.id)
    }
  }
  return list.length
}

export async function seedFoods(db: Db): Promise<number> {
  const list = foodsSeed as FoodSeed[]
  const CHUNK = 200
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).map((f) => ({
      householdId: null,
      nameEs: f.nameEs,
      nameEn: f.nameEn,
      searchNameEs: normalizeSearchName(f.nameEs),
      searchNameEn: normalizeSearchName(f.nameEn),
      aliases: f.aliases,
      defaultUnit: f.defaultUnit,
      kcal100g: f.kcal100g, protein100g: f.protein100g, carbs100g: f.carbs100g, fat100g: f.fat100g, fiber100g: f.fiber100g,
      source: 'usda' as const,
      sourceRef: f.sourceRef,
      allergens: f.allergens,
      gramsPerCup: f.gramsPerCup, gramsPerTbsp: f.gramsPerTbsp, gramsPerUnit: f.gramsPerUnit, densityGPerMl: f.densityGPerMl,
      seasonalMonths: f.seasonalMonths,
      isEstimated: f.isEstimated,
    }))
    await db
      .insert(schema.foods)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.foods.source, schema.foods.sourceRef],
        targetWhere: sql`source_ref IS NOT NULL AND household_id IS NULL`,
        set: {
          nameEs: sql`excluded.name_es`, nameEn: sql`excluded.name_en`, searchNameEs: sql`excluded.search_name_es`, searchNameEn: sql`excluded.search_name_en`,
          aliases: sql`excluded.aliases`, kcal100g: sql`excluded.kcal_100g`, protein100g: sql`excluded.protein_100g`, carbs100g: sql`excluded.carbs_100g`,
          fat100g: sql`excluded.fat_100g`, fiber100g: sql`excluded.fiber_100g`, gramsPerCup: sql`excluded.grams_per_cup`, gramsPerTbsp: sql`excluded.grams_per_tbsp`,
          gramsPerUnit: sql`excluded.grams_per_unit`, densityGPerMl: sql`excluded.density_g_per_ml`, allergens: sql`excluded.allergens`,
          seasonalMonths: sql`excluded.seasonal_months`, isEstimated: sql`excluded.is_estimated`, updatedAt: sql`now()`,
        },
      })
  }
  return list.length
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
